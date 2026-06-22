import assert from "node:assert/strict";
import { ESCAPE_ROOMS, endingFor, finalEscapeScore, newEscapeGame, nextRoom, renderEscape, submitRoom, useHint } from "../src/escape-game.js";

assert.equal(new Set(ESCAPE_ROOMS.map(room => room.image)).size, 12, "each room uses a distinct scene image");
for (const room of ESCAPE_ROOMS) {
  assert.match(room.image, /^\/public\/escape\/[\w-]+\.png$/, `${room.id} image path`);
  assert.ok(room.scene.length >= 80, `${room.id} has detailed scene narration`);
}
const firstRoomView = renderEscape({ ...newEscapeGame(), started:true, startedAt:Date.now() });
assert.match(firstRoomView, /escape-scene-visual/, "scene visual renders before the puzzle");
assert.match(firstRoomView, /장면 속으로/, "scene narration label renders");

assert.equal(ESCAPE_ROOMS.length, 12, "핵심 10개와 보너스 2개가 있어야 한다");
assert.equal(ESCAPE_ROOMS.filter(x => x.bonus).length, 2, "보너스 방은 2개여야 한다");

const game = { ...newEscapeGame(), started:true, startedAt:Date.now() };
for (const room of ESCAPE_ROOMS) {
  if (room.mechanic === "drag") game.interaction.placements = { ...room.correct };
  else if (room.mechanic === "sequence") game.interaction.sequence = [...room.correct];
  else if (room.mechanic === "stamp" || room.mechanic === "choice") game.interaction.selected = [room.correct];
  else game.interaction.selected = [...room.correct];
  assert.equal(submitRoom(game), true, `${room.title} 정답 판정`);
  nextRoom(game);
}
assert.equal(game.artifacts.length, 12);
assert.equal(game.score, 120);
assert.equal(finalEscapeScore(game), 20);
assert.equal(endingFor(game)[0], "열린 역사 탐정", "두 불확실성 플래그가 특별 엔딩을 연다");

const hintGame = newEscapeGame(); hintGame.score = 30;
useHint(hintGame); useHint(hintGame); useHint(hintGame);
assert.equal(hintGame.score, 18, "힌트 단계별 2·4·6점 감점");

const trustGame = newEscapeGame(); trustGame.roomIndex = 2; trustGame.interaction.selected = ["one"];
assert.equal(submitRoom(trustGame), false);
assert.equal(trustGame.historicalTrust, 92, "억지 단정은 신뢰도 8점 감점");

const goodGame = newEscapeGame(); Object.assign(goodGame,{score:100,historicalTrust:90,artifacts:Array(10).fill("조각")});
assert.equal(endingFor(goodGame)[0], "기록수호자");
const badGame = newEscapeGame(); badGame.forcedEnding = "bad_ending";
assert.equal(endingFor(badGame)[0], "기록 혼선");

console.log("방탈출 엔진 테스트 통과: 12개 방, 힌트, 신뢰도, 4개 엔딩");
