import { createServer } from "node:http";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import Busboy from "busboy";
import ffmpegPath from "ffmpeg-static";

const root = new URL(".", import.meta.url).pathname.replace(/^\/(.:)/, "$1");
const port = Number(process.env.PORT || 4173);
const dbPath = join(root, "data", "db.json");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml" };
let writeQueue = Promise.resolve();
const videoJobs = new Map();
const videoRoot = join(root, "data", "videos");
const tempRoot = join(root, "data", "render-temp");
const audioPath = process.env.AEGUKGA_AUDIO_PATH || join(root,"assets","audio","aegukga.mp3");
const transcriptionModel = process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe";

const seed = {
  classes: [{ id: "class-neulbom-5-2", name: "늘봄초 5학년 2반", code: "대한-815", teacher: "한누리 선생님" }],
  students: [
    { id: "demo-student", classId: "class-neulbom-5-2", name: "김하늘", state: null, updatedAt: null },
    { id: "student-doyun", classId: "class-neulbom-5-2", name: "이도윤", state: { complete:{1:true,2:true,3:true}, scores:{history:15,escape:20,meaning:15,blanks:15,singing:23,video:10} } },
    { id: "student-seoa", classId: "class-neulbom-5-2", name: "박서아", state: { complete:{1:true,2:true,3:false}, scores:{history:14,escape:18,meaning:15,blanks:12,singing:8,video:0} } },
    { id: "student-jiwoo", classId: "class-neulbom-5-2", name: "최지우", state: { complete:{1:true,2:false,3:false}, scores:{history:12,escape:20,meaning:10,blanks:0,singing:0,video:0} } }
  ]
};

async function ensureDb() {
  try { await stat(dbPath); }
  catch { await mkdir(dirname(dbPath), { recursive: true }); await writeFile(dbPath, JSON.stringify(seed, null, 2), "utf8"); }
}
async function readDb() { await ensureDb(); return JSON.parse(await readFile(dbPath, "utf8")); }
function saveDb(db) {
  writeQueue = writeQueue.then(async () => {
    const temp = `${dbPath}.tmp`;
    await writeFile(temp, JSON.stringify(db, null, 2), "utf8");
    await rename(temp, dbPath);
  });
  return writeQueue;
}
function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}
async function body(req) {
  let raw = "";
  for await (const chunk of req) { raw += chunk; if (raw.length > 1_000_000) throw new Error("payload too large"); }
  return raw ? JSON.parse(raw) : {};
}
function cleanState(input = {}) {
  // 음성 파일·blob·그림 data URL은 서버에 저장하지 않는다.
  const allowed = ["user","lessonStep","scores","complete","quizAnswer","escapeOrder","transcript","singingScore","group"];
  return Object.fromEntries(allowed.filter(k => input[k] !== undefined).map(k => [k, input[k]]));
}
function scoreOf(student) { return Object.values(student.state?.scores || {}).reduce((a, b) => a + Number(b || 0), 0); }
function gradeOf(score) { return score >= 85 ? "전문가" : score >= 60 ? "숙련가" : "개척가"; }

async function receiveVideoJob(req) {
  const id = randomUUID(); const workDir = join(tempRoot, id); await mkdir(workDir, { recursive:true });
  const files = []; const fields = {}; const writes=[]; let index = 0;
  await new Promise((resolve, reject) => {
    const bb = Busboy({ headers:req.headers, limits:{ files:20, fileSize:15*1024*1024, fields:10 } });
    bb.on("field", (name, value) => { fields[name] = value.slice(0, 5000); });
    bb.on("file", (name, stream, info) => {
      if (name !== "drawings" || !["image/jpeg","image/png","image/heic"].includes(info.mimeType)) { stream.resume(); return; }
      const extension = info.mimeType === "image/png" ? ".png" : info.mimeType === "image/heic" ? ".heic" : ".jpg";
      const target = join(workDir, `${String(index++).padStart(2,"0")}${extension}`); files.push(target);
      const out = createWriteStream(target); stream.pipe(out); writes.push(new Promise((done,fail)=>{out.on("finish",done);out.on("error",fail)}));
    });
    bb.on("error", reject); bb.on("finish", resolve); req.pipe(bb);
  });
  await Promise.all(writes);
  if (!files.length) { await rm(workDir,{recursive:true,force:true}); throw new Error("그림 파일이 필요합니다."); }
  return { id, workDir, files, groupName:(fields.groupName || "무궁화 탐험대").slice(0,40) };
}
async function receiveAudio(req) {
  const id=randomUUID();const workDir=join(tempRoot,`speech-${id}`);await mkdir(workDir,{recursive:true});
  let audioFile=null;let mimeType="audio/webm";let promptSegment="";const writes=[];
  await new Promise((resolve,reject)=>{
    const bb=Busboy({headers:req.headers,limits:{files:1,fileSize:20*1024*1024,fields:5}});
    bb.on("field",(name,value)=>{if(name==="promptSegment")promptSegment=value.slice(0,500)});
    bb.on("file",(name,stream,info)=>{
      if(name!=="audio"||!info.mimeType.startsWith("audio/")){stream.resume();return}
      mimeType=info.mimeType;const ext=info.mimeType.includes("wav")?".wav":info.mimeType.includes("ogg")?".ogg":info.mimeType.includes("mp4")?".m4a":".webm";audioFile=join(workDir,`recording${ext}`);
      const out=createWriteStream(audioFile);stream.pipe(out);writes.push(new Promise((done,fail)=>{out.on("finish",done);out.on("error",fail)}));
    });bb.on("error",reject);bb.on("finish",resolve);req.pipe(bb);
  });await Promise.all(writes);if(!audioFile)throw new Error("음성 파일이 필요합니다.");return{id,workDir,audioFile,mimeType,promptSegment};
}
function normalizeKorean(text){return text.replace(/[^가-힣 ]/g," ").replace(/\s+/g," ").trim()}
function lyricAccuracy(transcript,target){const answer=normalizeKorean(target).split(" ").filter(Boolean);const spoken=normalizeKorean(transcript).split(" ").filter(Boolean);const hits=answer.filter(word=>spoken.some(x=>x===word||x.includes(word)||word.includes(x))).length;return Math.round(hits/Math.max(answer.length,1)*100)}
async function transcribeWithOpenAI(file,mimeType,promptSegment){
  const bytes=await readFile(file);const form=new FormData();form.append("file",new Blob([bytes],{type:mimeType}),`recording${extname(file)}`);form.append("model",transcriptionModel);form.append("language","ko");if(promptSegment)form.append("prompt",promptSegment);
  const response=await fetch("https://api.openai.com/v1/audio/transcriptions",{method:"POST",headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},body:form});
  if(!response.ok)throw new Error(`OpenAI transcription ${response.status}`);const data=await response.json();return data.text||"";
}
function runFfmpeg(args) {
  return new Promise((resolve,reject) => {
    const child = spawn(ffmpegPath, args, { windowsHide:true }); let error="";
    child.stderr.on("data", d => { error += d.toString(); if(error.length>12000) error=error.slice(-12000); });
    child.on("error",reject); child.on("close",code=>code===0?resolve():reject(new Error(error || `ffmpeg ${code}`)));
  });
}
async function renderVideo(job) {
  videoJobs.set(job.id,{ id:job.id,status:"processing",progress:20,groupName:job.groupName });
  try {
    await mkdir(videoRoot,{recursive:true}); const concatPath=join(job.workDir,"slides.txt");
    const escaped = p => p.replaceAll("\\","/").replaceAll("'","'\\''");
    const concat = job.files.map(file=>`file '${escaped(file)}'\nduration 2.5`).join("\n") + `\nfile '${escaped(job.files.at(-1))}'\n`;
    await writeFile(concatPath,concat,"utf8"); const output=join(videoRoot,`${job.id}.mp4`); const duration=job.files.length*2.5;
    videoJobs.set(job.id,{...videoJobs.get(job.id),progress:55});
    const hasAudio=existsSync(audioPath);const audioInput=hasAudio?["-stream_loop","-1","-i",audioPath]:["-f","lavfi","-i","anullsrc=channel_layout=stereo:sample_rate=44100"];
    await runFfmpeg(["-y","-f","concat","-safe","0","-i",concatPath,...audioInput,"-vf","scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x102942,format=yuv420p","-t",String(duration),"-r","30","-c:v","libx264","-preset","veryfast","-c:a","aac","-shortest","-movflags","+faststart",output]);
    videoJobs.set(job.id,{id:job.id,status:"completed",progress:100,groupName:job.groupName,duration,soundtrack:hasAudio?"aegukga":"silent",downloadUrl:`/api/videos/${job.id}/file`,padletTitle:`${job.groupName}의 애국가 뮤직비디오`,padletDescription:"우리가 직접 그린 그림으로 애국가의 의미를 표현했습니다."});
  } catch (error) { videoJobs.set(job.id,{id:job.id,status:"failed",progress:0,error:"영상 생성에 실패했습니다."}); }
  finally { await rm(job.workDir,{recursive:true,force:true}); }
}

async function api(req, res, path) {
  if (path === "/api/health" && req.method === "GET") return json(res, 200, { ok: true, service: "aegukga-explorer", storage: "json" });
  if (path === "/api/config" && req.method === "GET") return json(res,200,{transcriptionConfigured:Boolean(process.env.OPENAI_API_KEY),transcriptionModel,audioConfigured:existsSync(audioPath)});
  if (path === "/api/transcriptions" && req.method === "POST") {
    if(!process.env.OPENAI_API_KEY)return json(res,503,{error:"OpenAI 음성 전사 API가 설정되지 않았습니다.",configured:false});
    const upload=await receiveAudio(req);
    try{const transcript=await transcribeWithOpenAI(upload.audioFile,upload.mimeType,upload.promptSegment);const accuracy=lyricAccuracy(transcript,upload.promptSegment);return json(res,200,{transcript,accuracy,score:Math.round(accuracy/100*25),model:transcriptionModel,audioStored:false})}
    finally{await rm(upload.workDir,{recursive:true,force:true})}
  }

  if (path === "/api/videos" && req.method === "POST") {
    const job = await receiveVideoJob(req); videoJobs.set(job.id,{id:job.id,status:"queued",progress:5,groupName:job.groupName});
    renderVideo(job); return json(res,202,videoJobs.get(job.id));
  }
  const videoMatch = path.match(/^\/api\/videos\/([a-f0-9-]+)$/i);
  if (videoMatch && req.method === "GET") {
    const job=videoJobs.get(videoMatch[1]); return job?json(res,200,job):json(res,404,{error:"영상 작업을 찾을 수 없습니다."});
  }
  const fileMatch = path.match(/^\/api\/videos\/([a-f0-9-]+)\/file$/i);
  if (fileMatch && req.method === "GET") {
    const job=videoJobs.get(fileMatch[1]); if(!job||job.status!=="completed") return json(res,404,{error:"완성된 영상이 없습니다."});
    const file=join(videoRoot,`${fileMatch[1]}.mp4`); const data=await readFile(file); res.writeHead(200,{"Content-Type":"video/mp4","Content-Disposition":`attachment; filename="aegukga-${fileMatch[1]}.mp4"`,"Content-Length":data.length}); return res.end(data);
  }

  const studentMatch = path.match(/^\/api\/students\/([a-z0-9-]+)$/i);
  if (studentMatch && req.method === "GET") {
    const db = await readDb(); const student = db.students.find(x => x.id === studentMatch[1]);
    return student ? json(res, 200, student) : json(res, 404, { error: "학생을 찾을 수 없습니다." });
  }
  if (studentMatch && req.method === "PUT") {
    const payload = await body(req); const db = await readDb(); const student = db.students.find(x => x.id === studentMatch[1]);
    if (!student) return json(res, 404, { error: "학생을 찾을 수 없습니다." });
    student.state = cleanState(payload.state); student.updatedAt = new Date().toISOString(); await saveDb(db);
    return json(res, 200, { ok: true, updatedAt: student.updatedAt });
  }

  const classMatch = path.match(/^\/api\/classes\/([a-z0-9-]+)\/dashboard$/i);
  if (classMatch && req.method === "GET") {
    const db = await readDb(); const cls = db.classes.find(x => x.id === classMatch[1]);
    if (!cls) return json(res, 404, { error: "학급을 찾을 수 없습니다." });
    const students = db.students.filter(x => x.classId === cls.id).map(x => {
      const score = scoreOf(x); const completed = Object.values(x.state?.complete || {}).filter(Boolean).length;
      return { id:x.id, name:x.name, score, completed, grade:gradeOf(score), updatedAt:x.updatedAt };
    });
    const average = students.length ? Math.round(students.reduce((a,b)=>a+b.score,0)/students.length) : 0;
    return json(res, 200, { class:cls, students, average, completionRate:Math.round(students.reduce((a,b)=>a+b.completed,0)/(students.length*3)*100) });
  }
  return json(res, 404, { error: "API 경로를 찾을 수 없습니다." });
}

createServer(async (req, res) => {
  try {
    const path = decodeURIComponent((req.url || "/").split("?")[0]);
    if (path.startsWith("/api/")) return await api(req, res, path);
    const requested = path === "/" ? "index.html" : path.replace(/^\//, "");
    const file = normalize(join(root, requested));
    if (!file.startsWith(normalize(root))) throw new Error("bad path");
    const info = await stat(file); const target = info.isDirectory() ? join(file, "index.html") : file;
    const data = await readFile(target);
    res.writeHead(200, { "Content-Type": types[extname(target)] || "application/octet-stream", "Cache-Control": "no-store" }); res.end(data);
  } catch (error) {
    if ((req.url || "").startsWith("/api/")) return json(res, 500, { error: "서버 처리 중 오류가 발생했습니다." });
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); res.end("찾을 수 없습니다.");
  }
}).listen(port, "127.0.0.1", async () => { await ensureDb(); console.log(`애국가 탐험대: http://127.0.0.1:${port}`); });
