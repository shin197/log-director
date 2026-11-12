import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, replaceBlocks } from './core.ts';
import { compileQuery, reorder } from './query.ts';
test('쿼리 조건 조합, 제외, 인용문과 오류', () => {
  const b = {
    id: '1',
    speaker: '제타',
    text: '급한 일 공격',
    diceResult: '성공',
    channel: '메인',
  };
  assert.equal(compileQuery('화자:제타 text:"급한 일" -내용:실패')(b), true);
  assert.equal(compileQuery('speaker:GM')(b), false);
  assert.throws(() => compileQuery('unknown:value'));
  assert.throws(() => compileQuery('text:"미완성'));
});
test('드래그 앞뒤 이동은 원본 배열을 변경하지 않음', () => {
  const blocks = ['a', 'b', 'c', 'd'].map((id) => ({
    id,
    speaker: '',
    text: '',
    diceResult: '',
  }));
  assert.deepEqual(
    reorder(blocks, 'a', 'c', true).map((b) => b.id),
    ['b', 'c', 'a', 'd'],
  );
  assert.deepEqual(
    reorder(blocks, 'd', 'b', false).map((b) => b.id),
    ['a', 'd', 'b', 'c'],
  );
  assert.deepEqual(
    blocks.map((b) => b.id),
    ['a', 'b', 'c', 'd'],
  );
});
test('원본과 빈 본문 판정 및 알 수 없는 필드 보존', () => {
  const raw =
    '\uFEFF' +
    JSON.stringify({
      messages: [
        { text: '', diceResult: '두 판정\n결과', extra: 42 },
        { text: '안녕 안녕', speaker: 'GM' },
      ],
    });
  const p = parse(raw, 'sample.json');
  const next = replaceBlocks(p, new Set([p.blocks[1].id]), '안녕', '안녕하세요');
  assert.equal(next.original?.raw, raw);
  assert.equal(next.blocks[0].diceResult, '두 판정\n결과');
  assert.equal(next.blocks[1].text, '안녕하세요 안녕하세요');
  assert.equal(p.blocks[1].text, '안녕 안녕');
  assert.deepEqual(parse(JSON.stringify(next), 'project.json'), next);
});
test('유효하지 않은 로그를 조용히 버리지 않음', () => {
  assert.throws(() => parse('{"messages":[{"text":null}]}', 'bad.json'));
});

import { selectMessage } from './selection.ts';
test('일반 클릭 단일 선택과 Ctrl 추가 및 해제', () => {
  const order = ['a', 'b', 'c', 'd'];
  let result = selectMessage(new Set(['b', 'c']), null, order, 'a', {
    ctrlKey: false,
    shiftKey: false,
  });
  assert.deepEqual([...result.selected], ['a']);
  result = selectMessage(result.selected, result.anchor, order, 'c', {
    ctrlKey: true,
    shiftKey: false,
  });
  assert.deepEqual([...result.selected], ['a', 'c']);
  result = selectMessage(result.selected, result.anchor, order, 'a', {
    ctrlKey: true,
    shiftKey: false,
  });
  assert.deepEqual([...result.selected], ['c']);
  assert.equal(result.anchor.selected, false);
});
test('Shift 구간 선택 및 해제, 역방향, 구간 밖 보존', () => {
  const order = ['a', 'b', 'c', 'd', 'e'];
  let result = selectMessage(
    new Set(['b', 'e']),
    { id: 'b', selected: true },
    order,
    'd',
    { ctrlKey: false, shiftKey: true },
  );
  assert.deepEqual([...result.selected].sort(), ['b', 'c', 'd', 'e']);
  result = selectMessage(result.selected, result.anchor, order, 'd', {
    ctrlKey: true,
    shiftKey: false,
  });
  result = selectMessage(result.selected, result.anchor, order, 'b', {
    ctrlKey: false,
    shiftKey: true,
  });
  assert.deepEqual([...result.selected], ['e']);
});
test('같은 상태의 Shift 클릭은 변경 없음, 필터 밖은 유지, 앵커 누락은 단일 선택', () => {
  const selected = new Set(['a', 'c', 'hidden']);
  const result = selectMessage(
    selected,
    { id: 'a', selected: true },
    ['a', 'b', 'c'],
    'c',
    { ctrlKey: false, shiftKey: true },
  );
  assert.deepEqual(result.selected, selected);
  assert.deepEqual(
    [
      ...selectMessage(selected, { id: 'missing', selected: true }, ['a', 'b'], 'b', {
        ctrlKey: false,
        shiftKey: true,
      }).selected,
    ],
    ['b'],
  );
  assert.deepEqual(
    [
      ...selectMessage(
        new Set(['a', 'hidden']),
        { id: 'a', selected: true },
        ['a', 'c'],
        'c',
        { ctrlKey: false, shiftKey: true },
      ).selected,
    ],
    ['a', 'hidden', 'c'],
  );
});
