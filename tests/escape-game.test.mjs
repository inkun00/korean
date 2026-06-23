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
assert.ok(ESCAPE_ROOMS[0].items.every(item => item.section && item.headline && item.original.length >= 8 && item.translation.length === item.original.length && item.vocabulary.length >= 4 && item.sourceUrl.includes("nl.go.kr")), "newspaper cards include aligned original and translation text");
const openedArticleGame = { ...newEscapeGame(), started:true, startedAt:Date.now() };
openedArticleGame.interaction.openedItem = "a";
const openedArticleView = renderEscape(openedArticleGame);
assert.match(openedArticleView, /인쳔 졔물포 뎐경 국가/, "original newspaper headline renders");
assert.match(openedArticleView, /독 립 신 문/, "newspaper masthead renders");
assert.match(openedArticleView, /분류 단서/, "article classification clue renders");
assert.match(openedArticleView, /옛말 풀이/, "historic vocabulary help renders separately");
assert.match(openedArticleView, /봉츅세 봉츅 아국태평 봉츅세/, "verified original article text renders");
assert.match(openedArticleView, /봉축하세 봉축하세 우리나라의 평안을 축하하세/, "modern Korean translation renders beside the original");
assert.match(openedArticleView, /현대어 번역/, "parallel translation heading renders");
assert.match(openedArticleView, /대한민국 신문 아카이브에서 원문 확인/, "official source link renders");

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
