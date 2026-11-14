import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, replaceBlocks } from './core.ts';
import {
  compileQuery,
  formatChipDisplay,
  formatChipToken,
  moveBlocks,
  parseQueryToChipsAndText,
  reorder,
  sanitizeLiveQuery,
} from './query.ts';
test('쿼리 조건 조합, 제외, 인용문과 오류 (Discord/GitHub 스타일)', () => {
  const b = {
    id: '1',
    characterId: 'c-zeta',
    speaker: '제타',
    text: '급한 일 공격',
    diceResult: '1D100<=50 성공',
    channel: '메인',
    sourceType: 'normal',
  };
  const sysBlock = {
    id: '2',
    characterId: 'builtin:system',
    text: '전투가 시작됩니다.',
    diceResult: '',
    channel: '메인',
    sourceType: 'system',
  };
  const charNamedSystem = {
    id: '3',
    characterId: null,
    speaker: 'system',
    text: '내 이름은 system입니다.',
    diceResult: '',
    channel: '잡담',
    sourceType: 'normal',
  };

  // 일반 텍스트(캐릭터/대사/판정 통합), from:, in:, dice:, is:, 제외(-) 조합
  assert.equal(
    compileQuery('from:제타 in:메인 dice:성공 "급한 일" -실패 -from:GM')(b),
    true,
  );
  assert.equal(compileQuery('from:GM')(b), false);
  assert.equal(compileQuery('-from:제타')(b), false);
  assert.equal(compileQuery('-from:제타')(sysBlock), true);

  // from:system은 캐릭터/화자 이름이 "system"인 메시지만 매칭하며 시스템 메시지는 매칭하지 않음
  assert.equal(compileQuery('from:system')(sysBlock), false);
  assert.equal(compileQuery('from:system')(charNamedSystem), true);

  // is:dice, is:system, is:normal, is:unlinked 검증
  assert.equal(compileQuery('is:dice')(b), true);
  assert.equal(compileQuery('is:dice')(sysBlock), false);
  assert.equal(compileQuery('is:system')(sysBlock), true);
  assert.equal(compileQuery('is:system')(charNamedSystem), false);
  assert.equal(compileQuery('is:normal')(b), true);
  assert.equal(compileQuery('is:normal')(sysBlock), false);
  assert.equal(compileQuery('is:unlinked')(charNamedSystem), true);
  assert.equal(compileQuery('is:unlinked')(b), false);
  assert.equal(compileQuery('is:unlinked')(sysBlock), false);

  // 기존 한글 문법 및 알 수 없는 필드/조건 거부
  assert.throws(() => compileQuery('화자:제타'));
  assert.throws(() => compileQuery('내용:공격'));
  assert.throws(() => compileQuery('unknown:value'));
  assert.throws(() => compileQuery('is:unknown'));
  assert.throws(() => compileQuery('from:"미완성'));

  // 칩 파싱 및 포맷팅, 실시간 입력 보정 검증
  const parsed = parseQueryToChipsAndText('from:제타 -in:잡담 is:dice "급한 일"');
  assert.equal(parsed.chips.length, 3);
  assert.equal(formatChipToken(parsed.chips[0]), 'from:제타');
  assert.deepEqual(formatChipDisplay(parsed.chips[0]), { icon: '👤', label: '제타' });
  assert.equal(formatChipToken(parsed.chips[1]), '-in:잡담');
  assert.deepEqual(formatChipDisplay(parsed.chips[2]), {
    icon: '🎲',
    label: '판정 있음',
  });
  assert.equal(parsed.text, '"급한 일"');
  assert.equal(sanitizeLiveQuery('from:제타 in:'), 'from:제타');
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

import {
  updateCharacter,
  inheritCharacter,
  fuzzyName,
  moveCharacter,
} from './characters.ts';
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

import { mergeConsecutive, PAGE_SIZE } from './logOperations.ts';
test('연속 병합은 화자와 채널 경계를 지키고 첫 표정과 시각을 유지', () => {
  const p = parse(
    JSON.stringify({
      messages: [
        {
          speaker: 'GM',
          text: '첫 줄',
          channelName: '메인',
          iconUrl: 'https://example.com/a',
          timestamp: 'first',
        },
        {
          speaker: 'GM',
          text: '다음 줄',
          channelName: '메인',
          iconUrl: 'https://example.com/b',
          timestamp: 'second',
        },
        { speaker: 'GM', text: '잡담', channelName: '잡담' },
        { type: 'system', text: '공지1', channelName: '메인' },
        { type: 'system', text: '공지2', channelName: '메인' },
      ],
    }),
    'sample.json',
  );
  const before = JSON.stringify(p);
  const blocks = mergeConsecutive(p.blocks);
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].text, '첫 줄\n다음 줄');
  assert.equal(blocks[0].timestamp, 'first');
  assert.equal(blocks[0].iconUrl, 'https://example.com/a');
  assert.equal(blocks[2].text, '공지1\n공지2');
  assert.equal(Object.hasOwn(blocks[2], 'speaker'), false);
  // 선택된 메시지만 병합하고 선택되지 않은 연속 메시지는 유지
  const partial = mergeConsecutive(p.blocks, new Set([p.blocks[0].id, p.blocks[1].id]));
  assert.equal(partial.length, 4);
  assert.equal(partial[0].text, '첫 줄\n다음 줄');
  assert.equal(partial[2].text, '공지1');
  assert.equal(partial[3].text, '공지2');
  assert.equal(JSON.stringify(p), before);
  assert.equal(PAGE_SIZE, 1000);

  // 주사위 판정이 있는 메시지 직후의 메시지는 같은 화자·채널이어도 병합하지 않음
  const withDice = parse(
    JSON.stringify({
      messages: [
        { speaker: 'GM', text: '선언', channelName: '메인' },
        {
          speaker: 'GM',
          text: '판정 굴림',
          diceResult: '(1D100<=50) ＞ 20 ＞ 성공',
          channelName: '메인',
        },
        { speaker: 'GM', text: '판정 후 대사', channelName: '메인' },
        { speaker: 'GM', text: '이어진 대사', channelName: '메인' },
      ],
    }),
    'dice-merge.json',
  );
  const mergedDice = mergeConsecutive(withDice.blocks);
  assert.equal(mergedDice.length, 2);
  assert.equal(mergedDice[0].text, '선언\n판정 굴림');
  assert.equal(mergedDice[0].diceResult, '(1D100<=50) ＞ 20 ＞ 성공');
  assert.equal(mergedDice[1].text, '판정 후 대사\n이어진 대사');
});

import { navigateMessages, swapMessage } from './keyboardNavigation.ts';
test('Ctrl 방향키는 커서를 되돌려도 선택을 보존하고 일반 방향키는 단일 선택', () => {
  const order = ['a', 'b', 'c', 'd'];
  let next = navigateMessages(order, 'a', new Set(['a']), 'ArrowDown', true)!;
  next = navigateMessages(order, next.id, next.selected, 'ArrowDown', true)!;
  next = navigateMessages(order, next.id, next.selected, 'ArrowUp', true)!;
  assert.equal(next.id, 'b');
  assert.deepEqual([...next.selected], ['a', 'b', 'c']);
  next = navigateMessages(order, next.id, next.selected, 'ArrowDown', false)!;
  assert.deepEqual([...next.selected], ['c']);
});
test('Home End와 10개 이동 및 페이지 경계', () => {
  const order = Array.from({ length: 1012 }, (_, i) => String(i));
  assert.equal(navigateMessages(order, '999', new Set(), 'PageDown', false)?.index, 1009);
  assert.equal(navigateMessages(order, '1009', new Set(), 'PageUp', false)?.index, 999);
  assert.equal(navigateMessages(order, '999', new Set(), 'Home', false)?.index, 0);
  assert.equal(navigateMessages(order, '999', new Set(), 'End', false)?.index, 1011);
  assert.equal(navigateMessages(order, '0', new Set(), 'ArrowUp', false)?.index, 0);
  assert.equal(navigateMessages([], null, new Set(), 'Home', false), null);
});
test('Alt 이동은 인접 메시지만 교환하며 입력과 원본은 보존', () => {
  const blocks = ['a', 'b', 'c'].map((id) => ({
    id,
    speaker: 'GM',
    text: id,
    diceResult: '',
  }));
  assert.deepEqual(
    swapMessage(blocks, 'b', 1).map((b) => b.id),
    ['a', 'c', 'b'],
  );
  assert.deepEqual(
    swapMessage(blocks, 'b', -1).map((b) => b.id),
    ['b', 'a', 'c'],
  );
  assert.equal(swapMessage(blocks, 'a', -1), blocks);
  assert.deepEqual(
    blocks.map((b) => b.id),
    ['a', 'b', 'c'],
  );
});

import { wrapSelectedText } from './textEdit.ts';
test('선택 텍스트 따옴표·괄호 자동 감싸기', () => {
  assert.deepEqual(wrapSelectedText('안녕 세상', 3, 5, '"'), {
    text: '안녕 "세상"',
    selectionStart: 4,
    selectionEnd: 6,
  });
  assert.deepEqual(wrapSelectedText('대사', 0, 2, '('), {
    text: '(대사)',
    selectionStart: 1,
    selectionEnd: 3,
  });
  assert.deepEqual(wrapSelectedText('대사', 0, 2, '['), {
    text: '[대사]',
    selectionStart: 1,
    selectionEnd: 3,
  });
  assert.deepEqual(wrapSelectedText('대사', 0, 2, '{'), {
    text: '{대사}',
    selectionStart: 1,
    selectionEnd: 3,
  });
  assert.deepEqual(wrapSelectedText('대사', 0, 2, "'"), {
    text: "'대사'",
    selectionStart: 1,
    selectionEnd: 3,
  });
  assert.deepEqual(wrapSelectedText('대사', 2, 0, '「'), {
    text: '「대사」',
    selectionStart: 1,
    selectionEnd: 3,
  });
  assert.equal(wrapSelectedText('대사', 1, 1, '"'), null);
  assert.equal(wrapSelectedText('대사', 0, 2, 'a'), null);
});

import {
  applyBulkEditToProject,
  createBulkEditState,
  getBulkFaceCharacter,
  pickRepresentativeId,
} from './bulkEdit.ts';
test('일괄 편집 대표 선택, 표정 조건, 일괄 패치 및 단일 적용', () => {
  const charA = {
    id: 'c-a',
    name: '제타',
    color: '#112233',
    iconUrl: 'https://example.com/a1.png',
    faces: [
      { name: '기본', iconUrl: 'https://example.com/a1.png' },
      { name: '웃음', iconUrl: 'https://example.com/a2.png' },
    ],
  };
  const charB = {
    id: 'c-b',
    name: '알파',
    color: '#445566',
    iconUrl: 'https://example.com/b1.png',
    faces: [{ name: '기본', iconUrl: 'https://example.com/b1.png' }],
  };
  const sys = systemCharacter();
  const baseProject = {
    format: 'log-studio' as const,
    version: 1 as const,
    title: '테스트',
    original: null,
    characters: [charA, charB, sys],
    blocks: [
      {
        id: 'm1',
        characterId: 'c-a',
        speaker: '제타',
        color: '#112233',
        iconUrl: 'https://example.com/a1.png',
        text: '첫 대사',
        diceResult: '성공',
        channel: '메인',
        timestamp: '10:00',
        sourceType: 'normal',
      },
      {
        id: 'm2',
        characterId: 'c-b',
        speaker: '알파',
        color: '#445566',
        iconUrl: 'https://example.com/b1.png',
        text: '둘째 대사',
        diceResult: '',
        channel: '잡담',
        timestamp: '10:01',
        sourceType: 'normal',
      },
      {
        id: 'm3',
        characterId: 'c-a',
        speaker: '제타',
        color: '#112233',
        iconUrl: 'https://example.com/a1.png',
        text: '셋째 대사',
        diceResult: '실패',
        channel: '메인',
        timestamp: '10:02',
        sourceType: 'normal',
      },
    ],
  };

  // 대표 메시지 선택: 커서가 선택 안에 있으면 커서, 없으면 맨 위 선택 메시지
  assert.equal(
    pickRepresentativeId(
      baseProject.blocks,
      baseProject.blocks,
      new Set(['m2', 'm3']),
      'm3',
    ),
    'm3',
  );
  assert.equal(
    pickRepresentativeId(
      baseProject.blocks,
      baseProject.blocks,
      new Set(['m2', 'm3']),
      'm1',
    ),
    'm2',
  );
  assert.equal(
    pickRepresentativeId(
      baseProject.blocks,
      [baseProject.blocks[2]],
      new Set(['m2', 'm3']),
      'm2',
    ),
    'm3',
  );

  // 같은 캐릭터만 선택했을 때만 표정 일괄 변경 가능
  const sameCharBulk = createBulkEditState(
    'm1',
    new Set(['m1', 'm3']),
    baseProject.blocks[0],
  );
  assert.equal(
    getBulkFaceCharacter(baseProject.blocks, sameCharBulk, baseProject.characters)?.id,
    'c-a',
  );

  const mixedBulk = createBulkEditState(
    'm1',
    new Set(['m1', 'm2']),
    baseProject.blocks[0],
  );
  assert.equal(
    getBulkFaceCharacter(baseProject.blocks, mixedBulk, baseProject.characters),
    undefined,
  );

  // 캐릭터 일괄 지정 + 표정 + 대사 앞뒤 추가 및 기존 대사 내부 일괄 치환
  const edited = applyBulkEditToProject(baseProject, {
    ...mixedBulk,
    speakerAction: { type: 'character', character: charA },
    iconUrl: 'https://example.com/a2.png',
    channel: '정보',
    textPrefix: '"',
    textSuffix: '"',
    replaceFind: '대사',
    replaceTo: '발언',
    diceMode: 'remove',
  });
  assert.equal(edited.blocks[0].text, '"첫 발언"');
  assert.equal(edited.blocks[1].text, '"둘째 발언"');
  assert.equal(edited.blocks[2].text, '셋째 대사');
  assert.equal(edited.blocks[0].characterId, 'c-a');
  assert.equal(edited.blocks[1].characterId, 'c-a');
  assert.equal(edited.blocks[1].iconUrl, 'https://example.com/a2.png');
  assert.equal(edited.blocks[0].channel, '정보');
  assert.equal(edited.blocks[1].channel, '정보');
  assert.equal(edited.blocks[0].diceResult, '');
  assert.equal(edited.blocks[2].channel, '메인');
  // 원본 project는 불변 유지
  assert.equal(baseProject.blocks[1].speaker, '알파');

  // 사용자 지정으로 연결 해제 시 기존 화자 이름은 유지하고 characterId만 해제
  const unlinked = applyBulkEditToProject(baseProject, {
    ...mixedBulk,
    speakerAction: { type: 'unlink' },
  });
  assert.equal(unlinked.blocks[0].characterId, null);
  assert.equal(unlinked.blocks[0].speaker, '제타');
  assert.equal(unlinked.blocks[1].characterId, null);
  assert.equal(unlinked.blocks[1].speaker, '알파');

  // 시스템 전환 시 speaker 키 제거 불변 조건 준수
  const systemConverted = applyBulkEditToProject(baseProject, {
    ...mixedBulk,
    speakerAction: { type: 'character', character: sys },
  });
  assert.equal('speaker' in systemConverted.blocks[0], false);
  assert.equal('speaker' in systemConverted.blocks[1], false);
  assert.equal(systemConverted.blocks[1].sourceType, 'system');
});

import { moveSelectedMessages } from './keyboardNavigation.ts';
test('일괄 이동(moveBlocks, moveSelectedMessages): 떨어진 선택 블록 응집 및 사이 틈 삽입', () => {
  const blocks = ['1', '2', '3', '4'].map((id) => ({
    id,
    speaker: 'A',
    text: id,
    diceResult: '',
  }));

  // [1, 2, 3, 4]에서 [1, 2, 4]를 선택해 [3] 바로 앞으로 이동 -> [1, 2, 4, 3]
  assert.deepEqual(
    moveBlocks(blocks, new Set(['1', '2', '4']), '3', false).map((b) => b.id),
    ['1', '2', '4', '3'],
  );

  // [1, 2, 3, 4]에서 [1, 2, 4]를 선택해 [3] 바로 뒤로 이동 -> [3, 1, 2, 4]
  assert.deepEqual(
    moveBlocks(blocks, new Set(['1', '2', '4']), '3', true).map((b) => b.id),
    ['3', '1', '2', '4'],
  );

  // 떨어진 블록 [1, 3]을 [4] 뒤로 이동 -> [2, 4, 1, 3]
  assert.deepEqual(
    moveBlocks(blocks, new Set(['1', '3']), '4', true).map((b) => b.id),
    ['2', '4', '1,3'.split(',')[0], '3'],
  );

  // 순서 변화가 없는 경우 원본 배열 참조를 그대로 반환 (불필요한 히스토리 방지)
  assert.equal(moveBlocks(blocks, new Set(['1', '2']), '3', false), blocks);

  // Alt+방향키 일괄 이동: 떨어진 [1, 3]을 위로 이동 시 첫 비선택 [2] 앞으로 응집 -> [1, 3, 2, 4]
  assert.deepEqual(
    moveSelectedMessages(blocks, new Set(['1', '3']), -1).map((b) => b.id),
    ['1', '3', '2', '4'],
  );

  // Alt+방향키 일괄 이동: 떨어진 [2, 4]를 아래로 이동 시 마지막 비선택 [3] 뒤로 응집 -> [1, 3, 2, 4]
  assert.deepEqual(
    moveSelectedMessages(blocks, new Set(['2', '4']), 1).map((b) => b.id),
    ['1', '3', '2', '4'],
  );

  // 원본 배열 불변 유지
  assert.deepEqual(
    blocks.map((b) => b.id),
    ['1', '2', '3', '4'],
  );
});

import { collectChannels } from './channels.ts';
test('채널 집계: 기본 채널 유지, 메시지 수 카운트, 빈 커스텀 채널 자동 제거', () => {
  const blocks = [
    { id: '1', speaker: 'A', text: '1', diceResult: '', channel: '메인' },
    { id: '2', speaker: 'A', text: '2', diceResult: '', channel: '잡담' },
    { id: '3', speaker: 'A', text: '3', diceResult: '', channel: '잡담' },
    { id: '4', speaker: 'A', text: '4', diceResult: '', channel: '비밀' },
  ];

  assert.deepEqual(collectChannels(blocks), [
    { name: '', count: 0, isDefault: true },
    { name: '메인', count: 1, isDefault: true },
    { name: '잡담', count: 2, isDefault: false },
    { name: '비밀', count: 1, isDefault: false },
  ]);

  // '비밀' 채널의 마지막 메시지가 다른 채널로 변경되거나 삭제되면 집계에서 자연스럽게 제거됨
  const afterMove = blocks.map((b) => (b.id === '4' ? { ...b, channel: '메인' } : b));
  assert.deepEqual(collectChannels(afterMove), [
    { name: '', count: 0, isDefault: true },
    { name: '메인', count: 2, isDefault: true },
    { name: '잡담', count: 2, isDefault: false },
  ]);

  // 빈 로그에서도 기본 채널('', '메인')은 항상 존재
  assert.deepEqual(collectChannels([]), [
    { name: '', count: 0, isDefault: true },
    { name: '메인', count: 0, isDefault: true },
  ]);
});

import {
  formatRelativeTime,
  isMeaningfulProject,
  saveAutosave,
  loadAutosave,
  clearAutosave,
} from './storage.ts';
test('자동저장: 상대 시간 포맷팅, 유의미한 프로젝트 판별, 스토리지 저장 및 복원', () => {
  const baseTime = 1700000000000;
  assert.equal(formatRelativeTime(baseTime, baseTime + 20_000), '방금 전');
  assert.equal(formatRelativeTime(baseTime, baseTime + 5 * 60_000), '5분 전');
  assert.equal(formatRelativeTime(baseTime, baseTime + 2 * 3600_000), '2시간 전');
  assert.equal(formatRelativeTime(baseTime, baseTime + 3 * 86400_000), '3일 전');

  // 유의미한 프로젝트 판별: 빈 프로젝트는 저장하지 않음
  assert.equal(
    isMeaningfulProject({
      format: 'log-studio',
      version: 1,
      title: '새 로그',
      original: null,
      blocks: [],
    }),
    false,
  );
  assert.equal(
    isMeaningfulProject({
      format: 'log-studio',
      version: 1,
      title: '제목 있는 로그',
      original: null,
      blocks: [],
    }),
    true,
  );
  assert.equal(
    isMeaningfulProject({
      format: 'log-studio',
      version: 1,
      title: '새 로그',
      original: { name: 'sample.json', raw: '{}' },
      blocks: [],
    }),
    true,
  );

  // mock localStorage 설정 후 저장 및 복원 검증
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  };

  const sampleProject = {
    format: 'log-studio' as const,
    version: 1 as const,
    title: '테스트 세션',
    original: null,
    blocks: [
      {
        id: 'b1',
        speaker: 'GM',
        text: '세션 시작',
        diceResult: '',
        sourceType: 'normal',
      },
    ],
  };

  clearAutosave();
  assert.equal(loadAutosave(), null);

  assert.equal(saveAutosave(sampleProject, baseTime), true);
  const loaded = loadAutosave();
  assert.ok(loaded);
  assert.equal(loaded.savedAt, baseTime);
  assert.equal(loaded.project.title, '테스트 세션');
  assert.equal(loaded.project.blocks.length, 1);
  assert.equal(loaded.project.blocks[0].text, '세션 시작');

  clearAutosave();
  assert.equal(loadAutosave(), null);
});

import fs from 'node:fs';
import { isSafeImageUrl } from './importFormats.ts';
test('다중 포맷 파싱: HTML(일반/Raw/CCF base64), Markdown, JSON 및 project.json', () => {
  // 1) base64 이미지 URL 안전성 검증
  assert.equal(isSafeImageUrl('https://example.com/a.png'), true);
  assert.equal(isSafeImageUrl('data:image/png;base64,iVBORw0KGgo='), true);
  assert.equal(isSafeImageUrl('data:image/svg+xml;base64,PHN2Zz4='), false);
  assert.equal(isSafeImageUrl('javascript:alert(1)'), false);

  // 2) sample_log 포맷 파일 검증
  const jsonRaw = fs.readFileSync('sample_log/json_sample.json', 'utf8');
  const jsonProj = parse(jsonRaw, 'json_sample.json');
  assert.ok(jsonProj.blocks.length > 100);

  const jsonBase64Raw = fs.readFileSync('sample_log/json_sample_base64.json', 'utf8');
  const jsonBase64Proj = parse(jsonBase64Raw, 'json_sample_base64.json');
  assert.equal(jsonBase64Proj.blocks.length, jsonProj.blocks.length);
  assert.ok(
    jsonBase64Proj.blocks.some((b) => (b.iconUrl ?? '').startsWith('data:image/')),
  );

  const htmlRaw = fs.readFileSync('sample_log/html_sample.html', 'utf8');
  const htmlProj = parse(htmlRaw, 'html_sample.html');
  assert.ok(htmlProj.blocks.length > 100);
  assert.ok(htmlProj.blocks.some((b) => b.diceResult.length > 0));
  assert.ok(htmlProj.blocks.some((b) => b.sourceType === 'system' && !('speaker' in b)));
  assert.equal(htmlProj.blocks[0]?.channel, '메인');
  assert.ok(!htmlProj.blocks[0]?.text.startsWith('[메인]'));

  const htmlCcfRaw = fs.readFileSync('sample_log/html_ccf_sample.html', 'utf8');
  const htmlCcfProj = parse(htmlCcfRaw, 'html_ccf_sample.html');
  assert.ok(htmlCcfProj.blocks.length > 100);
  assert.ok(htmlCcfProj.blocks.some((b) => (b.iconUrl ?? '').startsWith('data:image/')));

  const htmlRawText = fs.readFileSync('sample_log/html_raw_sample.html', 'utf8');
  const htmlRawProj = parse(htmlRawText, 'html_raw_sample.html');
  assert.ok(htmlRawProj.blocks.length > 100);

  const mdRaw = fs.readFileSync('sample_log/markdown_sample.md', 'utf8');
  const mdProj = parse(mdRaw, 'markdown_sample.md');
  assert.ok(mdProj.blocks.length > 100);
  assert.ok(mdProj.blocks.some((b) => b.sourceType === 'system' && !('speaker' in b)));
  assert.ok(mdProj.blocks.some((b) => b.diceResult.length > 0));
  assert.equal(mdProj.blocks[0]?.channel, '메인');
  assert.ok(!mdProj.blocks[0]?.text.startsWith('*[메인]*'));
  assert.equal(mdProj.blocks[1]?.channel, '잡담');

  const txtRaw = fs.readFileSync('sample_log/txt_sample.txt', 'utf8');
  const txtProj = parse(txtRaw, 'txt_sample.txt');
  assert.ok(txtProj.blocks.length > 100);
  assert.ok(txtProj.blocks.some((b) => b.sourceType === 'system' && !('speaker' in b)));
  assert.ok(txtProj.blocks.some((b) => b.diceResult.length > 0));
  assert.equal(txtProj.blocks[0]?.channel, '메인');
  assert.equal(txtProj.blocks[1]?.channel, '잡담');

  // 3) 채널 미표기 시 빈 채널('') 처리 및 JSON channelName 우선 참조 검증
  const emptyChJson = parse(
    JSON.stringify({
      title: 'Empty Channel JSON',
      messages: [
        { type: 'normal', speaker: 'A', channel: 'main', channelName: '', text: 'hello' },
        { type: 'normal', speaker: 'A', channel: 'other', text: 'world' },
      ],
    }),
    'empty.json',
  );
  assert.equal(emptyChJson.blocks[0]?.channel, '');
  assert.equal(emptyChJson.blocks[1]?.channel, '');

  const emptyChMd = parse('# Title\n\n---\n\n> 시스템 안내\n\n**A** :\n대사', 'empty.md');
  assert.equal(emptyChMd.blocks[0]?.channel, '');
  assert.equal(emptyChMd.blocks[1]?.channel, '');

  const emptyChTxt = parse('Title\n=====\n\nsystem :\n안내\n\nA :\n대사', 'empty.txt');
  assert.equal(emptyChTxt.blocks[0]?.channel, '');
  assert.equal(emptyChTxt.blocks[1]?.channel, '');

  // 4) project.json 왕복
  const roundtrip = parse(JSON.stringify(htmlCcfProj), 'test.project.json');
  assert.equal(roundtrip.blocks.length, htmlCcfProj.blocks.length);
});

test('imageUrl allows safe data:image base64 and HTML export deduplicates identical avatars', async () => {
  const { imageUrl } = await import('./clipboardCharacter.ts');
  const dataUri =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  assert.equal(imageUrl(dataUri), dataUri);
  assert.throws(() => imageUrl('javascript:alert(1)'));

  const proj: Project = {
    version: 1,
    title: 'Base64 Dedupe Test',
    characters: [
      {
        id: 'c1',
        name: 'A',
        color: '#888888',
        iconUrl: dataUri,
        aliases: [],
        faces: [{ name: '기본', imageUrl: dataUri }],
        defaultFace: '기본',
      },
    ],
    blocks: [
      {
        id: 'b1',
        sourceIndex: 0,
        channel: 'main',
        speaker: 'A',
        characterId: 'c1',
        iconUrl: dataUri,
        text: '첫 번째',
      },
      {
        id: 'b2',
        sourceIndex: 1,
        channel: 'main',
        speaker: 'A',
        characterId: 'c1',
        iconUrl: dataUri,
        text: '두 번째',
      },
    ],
  };

  const html = exportLog(proj, 'html');
  assert.equal(html.split(dataUri).length - 1, 1);
  assert.ok(html.includes('.avatar-image-0{background-image:url("'));
  assert.ok(
    html.includes('<span class="avatar avatar-image-0" aria-hidden="true"></span>'),
  );

  const reparsed = parse(html, 'dedupe.html');
  assert.equal(reparsed.blocks.length, 2);
  assert.equal(reparsed.blocks[0]?.iconUrl, dataUri);
  assert.equal(reparsed.blocks[1]?.iconUrl, dataUri);
});

test('내보내기 옵션(검색 필터, 시스템 채널 표시, Base64 인코딩) 및 4종 포맷 왕복 파싱', () => {
  const dataUri =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const extUrl = 'https://example.com/avatar.png';

  const proj = parse(
    JSON.stringify({
      title: '왕복 테스트 세션',
      messages: [
        {
          type: 'system',
          channelName: '메인',
          timestamp: '2026. 10. 20. 오후 08:00:00',
          text: '세션 시작 안내',
        },
        {
          type: 'normal',
          speaker: '몰토',
          color: '#b8342c',
          iconUrl: extUrl,
          channelName: '잡담',
          timestamp: '2026. 10. 20. 오후 08:01:00',
          text: '안녕하세요',
          diceResult: '(1B8) ＞ 8 ＞ 🎲S=8 강성공',
        },
        {
          type: 'normal',
          speaker: '몰토',
          color: '#b8342c',
          iconUrl: extUrl,
          channelName: '메인',
          timestamp: '2026. 10. 20. 오후 08:02:00',
          text: '메인 대사입니다',
        },
      ],
    }),
    'roundtrip.json',
  );

  // 1) 4개 포맷(html, txt, json, md) 모두 내보내기 후 다시 parse() 왕복 검증
  for (const fmt of ['html', 'txt', 'json', 'md'] as const) {
    const out = exportLog(proj, fmt);
    const re = parse(out, `out.${fmt}`);
    assert.equal(re.title, '왕복 테스트 세션');
    assert.equal(re.blocks.length, 3);
    assert.equal(re.blocks[0]?.sourceType, 'system');
    assert.equal(re.blocks[0]?.channel, '메인');
    assert.equal(re.blocks[0]?.text, '세션 시작 안내');
    assert.equal(re.blocks[1]?.speaker, '몰토');
    assert.equal(re.blocks[1]?.channel, '잡담');
    assert.equal(re.blocks[1]?.timestamp, '2026. 10. 20. 오후 08:01:00');
    assert.equal(re.blocks[1]?.text, '안녕하세요');
    assert.equal(re.blocks[1]?.diceResult, '(1B8) ＞ 8 ＞ 🎲S=8 강성공');
  }

  // 2) 검색 필터(query) 적용 내보내기
  const filteredMd = exportLog(proj, 'md', { query: 'in:잡담' });
  const parsedFiltered = parse(filteredMd, 'filtered.md');
  assert.equal(parsedFiltered.blocks.length, 1);
  assert.equal(parsedFiltered.blocks[0]?.channel, '잡담');

  // 3) 시스템 메시지 채널 비표시(showSystemChannel: false)
  for (const fmt of ['html', 'txt', 'json', 'md'] as const) {
    const outNoSysCh = exportLog(proj, fmt, { showSystemChannel: false });
    const reNoSysCh = parse(outNoSysCh, `nosys.${fmt}`);
    assert.equal(reNoSysCh.blocks[0]?.channel, '');
    assert.equal(reNoSysCh.blocks[1]?.channel, '잡담');
  }

  // 4) URL 이미지 Base64 인코딩(encodeBase64: true) 시 HTML CSS 및 JSON images 맵 중복 제거
  const urlMap = { [extUrl]: dataUri };
  const htmlB64 = exportLog(proj, 'html', { encodeBase64: true, urlToBase64: urlMap });
  assert.equal(htmlB64.split(dataUri).length - 1, 1);
  assert.ok(!htmlB64.includes(extUrl));
  const reHtmlB64 = parse(htmlB64, 'b64.html');
  assert.equal(reHtmlB64.blocks[1]?.iconUrl, dataUri);
  assert.equal(reHtmlB64.blocks[2]?.iconUrl, dataUri);

  const jsonB64 = exportLog(proj, 'json', { encodeBase64: true, urlToBase64: urlMap });
  assert.equal(jsonB64.split(dataUri).length - 1, 1);
  const parsedJsonObj = JSON.parse(jsonB64);
  assert.ok(parsedJsonObj.images && Object.keys(parsedJsonObj.images).length === 1);
  assert.equal(parsedJsonObj.messages[1].iconUrl, undefined);
  assert.ok(typeof parsedJsonObj.messages[1].iconImage === 'string');
  const reJsonB64 = parse(jsonB64, 'b64.json');
  assert.equal(reJsonB64.blocks[1]?.iconUrl, dataUri);
  assert.equal(reJsonB64.blocks[2]?.iconUrl, dataUri);
});

test('moveCharacter는 드래그 순서 변경 시 원본 불변성과 객체 참조를 유지한다', () => {
  const c1 = { id: 'c1', name: 'A', color: '#111111', iconUrl: '', faces: [] };
  const c2 = { id: 'c2', name: 'B', color: '#222222', iconUrl: '', faces: [] };
  const c3 = { id: 'c3', name: 'C', color: '#333333', iconUrl: '', faces: [] };
  const list = [c1, c2, c3];

  const forward = moveCharacter(list, 0, 2, true);
  assert.deepEqual(
    forward.map((x) => x.id),
    ['c2', 'c3', 'c1'],
  );
  assert.equal(forward[2], c1);
  assert.deepEqual(
    list.map((x) => x.id),
    ['c1', 'c2', 'c3'],
  );

  const backward = moveCharacter(list, 2, 0, false);
  assert.deepEqual(
    backward.map((x) => x.id),
    ['c3', 'c1', 'c2'],
  );

  assert.equal(moveCharacter(list, 1, 1, false), list);
  assert.equal(moveCharacter(list, 0, 1, false), list);
});
