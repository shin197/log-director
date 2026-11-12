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

import { exportLog } from './export.ts';
import { readFileSync } from 'node:fs';
test('샘플 JSON 내보내기 구조와 원본 보존', () => {
  const raw = readFileSync('sample_log/json_sample.json', 'utf8');
  const p = parse(raw, 'sample.json');
  const before = JSON.stringify(p);
  const data = JSON.parse(exportLog(p, 'json'));
  assert.equal(data.messageCount, p.blocks.length);
  assert.equal(data.format, undefined);
  assert.equal(data.original, undefined);
  assert.deepEqual(
    data.messages.map((m: any) => m.text),
    p.blocks.map((b) => b.text),
  );
  assert.equal(JSON.stringify(p), before);
  for (const format of ['html', 'txt', 'md'] as const)
    assert.ok(exportLog(p, format).includes(p.title));
});
test('수정한 판정의 오래된 roll 제거와 HTML 이스케이프', () => {
  const p = parse(
    JSON.stringify({
      title: '<script>bad</script>',
      messages: [
        {
          text: '<img onerror="bad">',
          speaker: 'GM',
          diceResult: 'old',
          roll: { result: 'old' },
        },
      ],
    }),
    'test.json',
  );
  p.blocks[0].diceResult = 'new';
  const data = JSON.parse(exportLog(p, 'json'));
  assert.equal(data.messages[0].diceResult, 'new');
  assert.equal(data.messages[0].roll, undefined);
  const html = exportLog(p, 'html');
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;img'));
});

import { defaultDisplay, displayTime } from './presentation.ts';
test('타임스탬프 형식과 오전 오후 변환', () => {
  assert.equal(
    displayTime('2026. 11. 13. 오후 09:05:30', {
      ...defaultDisplay,
      timestampFormat: 'YYYY-MM-DD',
    }),
    '2026-11-13',
  );
  assert.equal(
    displayTime('2026. 11. 13. 오전 12:05:30', {
      ...defaultDisplay,
      timestampFormat: 'HH:mm',
    }),
    '00:05',
  );
  assert.equal(
    displayTime('2026. 11. 13. 오후 12:05:30', {
      ...defaultDisplay,
      timestampFormat: 'HH:mm',
    }),
    '12:05',
  );
  assert.equal(displayTime('custom', defaultDisplay), 'custom');
});
test('표시 옵션을 모든 출력에 적용하고 프로젝트 설정과 표정 이름 보존', () => {
  const p = parse(
    JSON.stringify({
      title: 'test',
      messages: [
        {
          speaker: 'GM',
          text: 'hello',
          channelName: '잡담',
          timestamp: '2026. 11. 13. 오후 09:05:30',
          createdAt: 123,
        },
      ],
    }),
    'test.json',
  );
  p.display = { ...defaultDisplay, showChannel: false, showTimestamp: false };
  p.expressions = [{ speaker: 'GM', iconUrl: 'https://example.com/a.png', name: '' }];
  for (const format of ['html', 'txt', 'md', 'json'] as const) {
    const result = exportLog(p, format);
    assert.ok(!result.includes('잡담'));
    assert.ok(!result.includes('09:05'));
  }
  const json = JSON.parse(exportLog(p, 'json'));
  assert.equal(json.messages[0].createdAt, undefined);
  assert.deepEqual(parse(JSON.stringify(p), 'project.json'), p);
});

import { updateCharacter, inheritCharacter, fuzzyName } from './characters.ts';
test('캐릭터 ID 마이그레이션과 이름 변경 격리 및 저장', () => {
  const raw = JSON.stringify({
    messages: [
      { speaker: 'GM', text: 'a', iconUrl: 'https://example.com/a', color: '#123456' },
      { speaker: 'GM', text: 'b', iconUrl: 'https://example.com/b' },
      { speaker: '메튜', text: 'c' },
    ],
  });
  const p = parse(raw, 'sample.json');
  assert.equal(p.characters?.length, 3);
  const gm = p.characters![0];
  assert.equal(gm.faces.length, 2);
  assert.equal(gm.faces[0].name, '');
  assert.equal(p.blocks[0].characterId, p.blocks[1].characterId);
  assert.throws(() => updateCharacter(p, { ...gm, name: '메튜' }));
  const changed = updateCharacter(p, { ...gm, name: '진행자', color: '#abcdef' });
  assert.equal(changed.blocks[0].speaker, '진행자');
  assert.equal(changed.blocks[2].speaker, '메튜');
  assert.equal(changed.blocks[0].characterId, gm.id);
  assert.equal(changed.original?.raw, raw);
  assert.deepEqual(parse(JSON.stringify(changed), 'project.json'), changed);
  const custom = { ...p, blocks: p.blocks.map((b) => ({ ...b, characterId: null })) };
  assert.equal(
    updateCharacter(custom, { ...gm, name: '다른 이름' }).blocks[0].speaker,
    'GM',
  );
});
test('캐릭터 상속과 부분 순서 검색', () => {
  const p = parse(
    JSON.stringify({
      messages: [
        { speaker: 'GM', text: 'a', iconUrl: 'https://example.com/a', color: '#123456' },
      ],
    }),
    'sample.json',
  );
  const b = inheritCharacter({ ...p.blocks[0], speaker: 'custom' }, p.characters![0]);
  assert.equal(b.speaker, 'GM');
  assert.equal(b.iconUrl, 'https://example.com/a');
  assert.equal(b.color, '#123456');
  assert.equal(fuzzyName('사령관 그레샴', '사그샴'), true);
  assert.equal(fuzzyName('메튜', 'GM'), false);
});

import { parseClipboardCharacter } from './clipboardCharacter.ts';
test('코코포리아 붙여넣기는 필요한 필드와 표정만 추출', () => {
  const url = 'https://example.com/normal.png';
  const c = parseClipboardCharacter(
    JSON.stringify({
      kind: 'character',
      data: {
        name: '라르코',
        color: '#A69BAC',
        iconUrl: `[${url}](${url})`,
        faces: [
          { label: '@평소', iconUrl: url },
          { label: '@대화', iconUrl: 'https://example.com/talk.png' },
        ],
        memo: '제외',
        status: [{ label: 'HP', value: 28 }],
        commands: '제외',
      },
    }),
  );
  assert.equal(c.name, '라르코');
  assert.equal(c.iconUrl, url);
  assert.equal(c.faces.length, 2);
  assert.equal(c.faces[0].name, '@평소');
  assert.deepEqual(Object.keys(c).sort(), ['color', 'faces', 'iconUrl', 'id', 'name']);
  assert.notEqual(
    parseClipboardCharacter(
      JSON.stringify({ kind: 'character', data: { name: '라르코' } }),
    ).id,
    c.id,
  );
  assert.throws(() => parseClipboardCharacter('{bad'));
  assert.throws(() =>
    parseClipboardCharacter(JSON.stringify({ kind: 'item', data: { name: '라르코' } })),
  );
  assert.throws(() =>
    parseClipboardCharacter(
      JSON.stringify({
        kind: 'character',
        data: { name: '라르코', iconUrl: 'javascript:alert(1)' },
      }),
    ),
  );
  const fallback = parseClipboardCharacter(
    JSON.stringify({
      kind: 'character',
      data: { name: '라르코', faces: [{ iconUrl: url }] },
    }),
  );
  assert.equal(fallback.iconUrl, url);
  assert.equal(fallback.faces[0].name, '');
});

import { SYSTEM_CHARACTER_ID, systemCharacter } from './systemCharacter.ts';
test('시스템 캐릭터는 고정 ID로 생성되고 화자 키 없이 전용 형식으로 왕복', () => {
  const p = parse(
    JSON.stringify({
      messages: [
        { type: 'system', text: '알림' },
        {
          type: 'normal',
          speaker: 'GM',
          text: '대사',
          iconUrl: 'https://example.com/a',
          color: '#123456',
        },
      ],
    }),
    'log.json',
  );
  assert.equal(p.characters!.filter((c) => c.id === SYSTEM_CHARACTER_ID).length, 1);
  assert.equal(Object.hasOwn(p.blocks[0], 'speaker'), false);
  assert.equal(p.blocks[0].characterId, SYSTEM_CHARACTER_ID);
  assert.throws(() => updateCharacter(p, { ...systemCharacter(), name: '변경' }));
  const system = inheritCharacter(p.blocks[1], systemCharacter());
  assert.equal(Object.hasOwn(system, 'speaker'), false);
  assert.equal(system.sourceType, 'system');
  assert.equal(system.iconUrl, '');
  const next = { ...p, blocks: [system] };
  const exported = JSON.parse(exportLog(next, 'json'));
  assert.equal(Object.hasOwn(exported.messages[0], 'speaker'), false);
  assert.equal(exported.messages[0].type, 'system');
  assert.equal(exported.messages[0].iconUrl, undefined);
  assert.equal(exported.messages[0].color, undefined);
  assert.equal(
    Object.hasOwn(parse(JSON.stringify(exported), 'log.json').blocks[0], 'speaker'),
    false,
  );
  assert.deepEqual(parse(JSON.stringify(next), 'project.json'), next);
  assert.ok(exportLog(next, 'html').includes('class="message system"'));
  assert.ok(!exportLog(next, 'html').includes('<img'));
  assert.ok(exportLog(next, 'md').includes('> 대사'));
  const normal = inheritCharacter(
    system,
    p.characters!.find((c) => c.name === 'GM')!,
  );
  assert.equal(normal.sourceType, 'normal');
  assert.equal(normal.speaker, 'GM');
});

test('이전 null 시스템 화자는 불러올 때 키 제거', () => {
  const p = parse(
    JSON.stringify({ messages: [{ type: 'system', speaker: null, text: '알림' }] }),
    'old.json',
  );
  assert.equal(Object.hasOwn(p.blocks[0], 'speaker'), false);
  const oldProject = { ...p, blocks: p.blocks.map((b) => ({ ...b, speaker: null })) };
  assert.equal(
    Object.hasOwn(
      parse(JSON.stringify(oldProject), 'old.project.json').blocks[0],
      'speaker',
    ),
    false,
  );
});
