import{test}from'node:test';
import assert from'node:assert/strict';
import{parse,replaceBlocks}from'./core.ts';
import{compileQuery,reorder}from'./query.ts';
test('쿼리 조건 조합, 제외, 인용문과 오류',()=>{
 const b={id:'1',speaker:'제타',text:'급한 일 공격',diceResult:'성공',channel:'메인'};
 assert.equal(compileQuery('화자:제타 text:"급한 일" -내용:실패')(b),true);
 assert.equal(compileQuery('speaker:GM')(b),false);
 assert.throws(()=>compileQuery('unknown:value'));
 assert.throws(()=>compileQuery('text:"미완성'));
});
test('드래그 앞뒤 이동은 원본 배열을 변경하지 않음',()=>{
 const blocks=['a','b','c','d'].map(id=>({id,speaker:'',text:'',diceResult:''}));
 assert.deepEqual(reorder(blocks,'a','c',true).map(b=>b.id),['b','c','a','d']);
 assert.deepEqual(reorder(blocks,'d','b',false).map(b=>b.id),['a','d','b','c']);
 assert.deepEqual(blocks.map(b=>b.id),['a','b','c','d']);
});
test('원본과 빈 본문 판정 및 알 수 없는 필드 보존',()=>{
 const raw='\uFEFF'+JSON.stringify({messages:[{text:'',diceResult:'두 판정\n결과',extra:42},{text:'안녕 안녕',speaker:'GM'}]});
 const p=parse(raw,'sample.json');const next=replaceBlocks(p,new Set([p.blocks[1].id]),'안녕','안녕하세요');
 assert.equal(next.original?.raw,raw);assert.equal(next.blocks[0].diceResult,'두 판정\n결과');assert.equal(next.blocks[1].text,'안녕하세요 안녕하세요');assert.equal(p.blocks[1].text,'안녕 안녕');
 assert.deepEqual(parse(JSON.stringify(next),'project.json'),next);
});
test('유효하지 않은 로그를 조용히 버리지 않음',()=>{assert.throws(()=>parse('{"messages":[{"text":null}]}','bad.json'));});
