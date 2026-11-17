import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, replaceBlocks } from './core.ts';
import {
  addFilterToStyleCard,
  buildMessageStyleObjects,
  collectStyleCardUsages,
  createStyleCard,
  createStyleResolver,
  defaultProjectStyles,
  duplicateStyleCard,
  exportStylesConfig,
  moveStyleCard,
  normalizeMessageStyleProps,
  parseStylesConfig,
  removeStyleCardFromProject,
  unlinkStyleUsageFromProject,
} from './styles.ts';
import {
  formatColorCodeForInput,
  getContrastTextColor,
  normalizeColorCodeInput,
  resolvePickerColor,
  toStoredColorValue,
} from './color.ts';
import {
  collapseToRanges,
  computeThumbHeight,
  getMarkerBoundsPercent,
} from './scrollbarOverview.ts';
import {
  createSlotFromBlock,
  getQuickSlotNumber,
  removeQuickCharacterSlot,
  resolveQuickSlotForComposer,
  setQuickCharacterSlot,
} from './quickSlots.ts';
import {
  applyBulkEditToProject,
  createBulkEditState,
  getBulkFaceCharacter,
  getBulkStyleCheckboxState,
  pickRepresentativeId,
  toggleBulkStyleOp,
} from './bulkEdit.ts';
import {
  compileQuery,
  formatChipDisplay,
  formatChipToken,
  moveBlocks,
  parseFilterValueInput,
  parseQueryToChipsAndText,
  reorder,
  sanitizeLiveQuery,
  splitSearchTokens,
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

  // 따옴표 이스케이프(\") 및 따옴표 문자 자체 검색 검증
  const quoteBlock = {
    id: '4',
    characterId: null,
    speaker: 'A',
    text: '그는 "안녕"이라고 말했다.',
    diceResult: '',
    channel: '메인',
    sourceType: 'normal',
  };
  const normalBlock = {
    id: '5',
    characterId: null,
    speaker: 'B',
    text: '일반적인 대사입니다.',
    diceResult: '',
    channel: '메인',
    sourceType: 'normal',
  };

  // 1) 따옴표(\") 검색: 따옴표가 있는 블록만 일치
  const predQuote = compileQuery('\\"');
  assert.equal(predQuote(quoteBlock), true);
  assert.equal(predQuote(normalBlock), false);

  // 2) 따옴표 제외(-\"): 따옴표가 없는 블록만 일치
  const predNoQuote = compileQuery('-\\"');
  assert.equal(predNoQuote(quoteBlock), false);
  assert.equal(predNoQuote(normalBlock), true);

  // 3) 구문 내부 따옴표 이스케이프: "\"안녕\""
  const predPhrase = compileQuery('"\\"안녕\\""');
  assert.equal(predPhrase(quoteBlock), true);
  assert.equal(predPhrase(normalBlock), false);

  // 4) 구문 내부 따옴표 제외: -"\"안녕\""
  const predNoPhrase = compileQuery('-"\\"안녕\\""');
  assert.equal(predNoPhrase(quoteBlock), false);
  assert.equal(predNoPhrase(normalBlock), true);

  // 5) 칩 파싱에서 제외 텍스트 칩으로 정상 인식
  const quoteChipParse = parseQueryToChipsAndText('-\\" -"\\"안녕\\""');
  assert.equal(quoteChipParse.chips.length, 2);
  assert.equal(quoteChipParse.chips[0].key, 'text');
  assert.equal(quoteChipParse.chips[0].value, '"');
  assert.equal(quoteChipParse.chips[0].negative, true);
  assert.equal(quoteChipParse.chips[1].value, '"안녕"');
  assert.equal(quoteChipParse.chips[1].negative, true);

  // 6) 칩 UI 표시에서는 백슬래시가 제거되고, 직렬화 토큰은 compileQuery와 왕복 일치
  assert.deepEqual(formatChipDisplay(quoteChipParse.chips[0]), {
    icon: '🚫',
    label: '"',
  });
  assert.deepEqual(formatChipDisplay(quoteChipParse.chips[1]), {
    icon: '🚫',
    label: '"안녕"',
  });
  const roundTripQuery = formatChipToken(quoteChipParse.chips[0]);
  assert.equal(compileQuery(roundTripQuery)(quoteBlock), false);
  assert.equal(compileQuery(roundTripQuery)(normalBlock), true);

  // 7) SearchBar 자동완성/칩 입력 파싱 및 토큰 분리 (백슬래시 이스케이프 포함)
  assert.equal(parseFilterValueInput('\\"'), '"');
  assert.equal(parseFilterValueInput('"\\"'), '"');
  assert.equal(parseFilterValueInput('"\\""'), '"');
  assert.equal(parseFilterValueInput('"안녕 \\"세상\\""'), '안녕 "세상"');
  assert.equal(parseFilterValueInput('"a\\\\b"'), 'a\\b');

  assert.deepEqual(
    splitSearchTokens('-"a \\"b\\"" -from:"제타 \\"1\\"" \\"').map((t) => t.raw),
    ['-"a \\"b\\""', '-from:"제타 \\"1\\""', '\\"'],
  );

  // 8) sanitizeLiveQuery 후 compileQuery에서도 일반 텍스트 \" 및 -"\"가 정상 동작
  const livePlainQuote = sanitizeLiveQuery('\\"');
  assert.equal(compileQuery(livePlainQuote)(quoteBlock), true);
  assert.equal(compileQuery(livePlainQuote)(normalBlock), false);

  const liveNegPartialQuote = sanitizeLiveQuery('-"\\"');
  assert.equal(compileQuery(liveNegPartialQuote)(quoteBlock), false);
  assert.equal(compileQuery(liveNegPartialQuote)(normalBlock), true);
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
  assert.equal(next.original[0]?.raw, raw);
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
  assert.equal(changed.original[0]?.raw, raw);
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

import { mergeConsecutive, PAGE_SIZE, resolveMergeSeparator } from './logOperations.ts';
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
  // 기본 동작: 표정이 다르면 병합하지 않고 분리 유지
  const defaultBlocks = mergeConsecutive(p.blocks);
  assert.equal(defaultBlocks.length, 4);
  assert.equal(defaultBlocks[0].text, '첫 줄');
  assert.equal(defaultBlocks[1].text, '다음 줄');

  // mergeDifferentFaces = true: 표정이 달라도 첫 표정과 시각을 유지하며 병합
  const blocks = mergeConsecutive(p.blocks, undefined, '\n', true);
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].text, '첫 줄\n다음 줄');
  assert.equal(blocks[0].timestamp, 'first');
  assert.equal(blocks[0].iconUrl, 'https://example.com/a');
  assert.equal(blocks[2].text, '공지1\n공지2');
  assert.equal(Object.hasOwn(blocks[2], 'speaker'), false);
  // 선택된 메시지만 병합하고 선택되지 않은 연속 메시지는 유지
  const partial = mergeConsecutive(p.blocks, new Set([p.blocks[0].id, p.blocks[1].id]), '\n', true);
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
  // Shift + 위/아래 10칸 이동 (step=10, 단일 선택)
  assert.equal(navigateMessages(order, '50', new Set(), 'ArrowDown', false, 10)?.index, 60);
  assert.equal(navigateMessages(order, '50', new Set(), 'ArrowUp', false, 10)?.index, 40);
  // Ctrl+Shift + 위/아래 10칸 이동 (extend=true, step=10): 지나간 10개를 모두 선택에 포함
  const bulkDown = navigateMessages(order, '50', new Set(['50']), 'ArrowDown', true, 10)!;
  assert.equal(bulkDown.index, 60);
  assert.equal(bulkDown.selected.size, 11);
  for (let i = 50; i <= 60; i++) {
    assert.ok(bulkDown.selected.has(String(i)));
  }
  const bulkUp = navigateMessages(order, '60', new Set(['60']), 'ArrowUp', true, 10)!;
  assert.equal(bulkUp.index, 50);
  assert.equal(bulkUp.selected.size, 11);
  for (let i = 50; i <= 60; i++) {
    assert.ok(bulkUp.selected.has(String(i)));
  }
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
    original: [],
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
function createMockIndexedDB() {
  const stores = new Map<string, Map<string, unknown>>();
  return {
    open(_name: string, _version?: number) {
      const req: any = {
        result: null,
        error: null,
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
      };
      const db: any = {
        objectStoreNames: {
          contains: (storeName: string) => stores.has(storeName),
        },
        createObjectStore: (storeName: string) => {
          if (!stores.has(storeName)) stores.set(storeName, new Map());
        },
        transaction: (storeName: string) => {
          const map = stores.get(storeName) ?? new Map<string, unknown>();
          stores.set(storeName, map);
          const tx: any = { oncomplete: null, onerror: null, onabort: null };
          const scheduleComplete = () =>
            queueMicrotask(() => {
              tx.oncomplete?.();
            });
          return {
            objectStore: () => ({
              get: (key: string) => {
                const getReq: any = { result: undefined, onsuccess: null, onerror: null };
                queueMicrotask(() => {
                  getReq.result = map.get(key);
                  getReq.onsuccess?.();
                });
                return getReq;
              },
              put: (val: unknown, key: string) => {
                map.set(key, val);
                scheduleComplete();
              },
              delete: (key: string) => {
                map.delete(key);
                scheduleComplete();
              },
            }),
            set oncomplete(fn: any) {
              tx.oncomplete = fn;
            },
            set onerror(fn: any) {
              tx.onerror = fn;
            },
            set onabort(fn: any) {
              tx.onabort = fn;
            },
          };
        },
        close: () => { },
      };
      req.result = db;
      queueMicrotask(() => {
        req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    },
  };
}

test('자동저장: 상대 시간 포맷팅, 유의미한 프로젝트 판별, IndexedDB 저장 및 복원', async () => {
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
      original: [],
      blocks: [],
    }),
    false,
  );
  assert.equal(
    isMeaningfulProject({
      format: 'log-studio',
      version: 1,
      title: '제목 있는 로그',
      original: [],
      blocks: [],
    }),
    true,
  );
  assert.equal(
    isMeaningfulProject({
      format: 'log-studio',
      version: 1,
      title: '새 로그',
      original: [{ name: 'sample.json', raw: '{}' }],
      blocks: [],
    }),
    true,
  );

  // mock IndexedDB + localStorage 설정 후 저장 및 복원 검증
  const legacyStore = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => legacyStore.get(k) ?? null,
    setItem: (k: string, v: string) => legacyStore.set(k, v),
    removeItem: (k: string) => legacyStore.delete(k),
  };
  (globalThis as any).indexedDB = createMockIndexedDB();

  const sampleProject = {
    format: 'log-studio' as const,
    version: 1 as const,
    title: '테스트 세션',
    original: [],
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

  await clearAutosave();
  assert.equal(await loadAutosave(), null);

  assert.equal(await saveAutosave(sampleProject, baseTime), true);
  const loaded = await loadAutosave();
  assert.ok(loaded);
  assert.equal(loaded.savedAt, baseTime);
  assert.equal(loaded.project.title, '테스트 세션');
  assert.equal(loaded.project.blocks.length, 1);
  assert.equal(loaded.project.blocks[0].text, '세션 시작');

  await clearAutosave();
  assert.equal(await loadAutosave(), null);

  // 5MB 이상 대용량 프로젝트도 IndexedDB에서는 정상 자동저장 및 복원 가능
  const oversizedProject = {
    format: 'log-studio' as const,
    version: 1 as const,
    title: '대용량 테스트',
    original: [{ name: 'big.json', raw: 'x'.repeat(6 * 1024 * 1024) }],
    blocks: [],
  };
  assert.equal(await saveAutosave(oversizedProject, baseTime), true);
  const loadedOversized = await loadAutosave();
  assert.ok(loadedOversized);
  assert.equal(loadedOversized.project.title, '대용량 테스트');

  await clearAutosave();
});

import fs from 'node:fs';
import { isSafeImageUrl } from './importFormats.ts';
import {
  blobToDataUrl,
  collectExternalImageUrls,
  embedExternalImagesInProject,
  getUnusedImageStats,
  internProjectImages,
  isImagePoolRef,
  normalizeProjectImagePool,
  resolveImageUrl,
} from './imagePool.ts';
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
  assert.ok(jsonBase64Proj.images && Object.keys(jsonBase64Proj.images).length > 0);
  assert.ok(jsonBase64Proj.blocks.some((b) => isImagePoolRef(b.iconUrl)));
  assert.ok(
    jsonBase64Proj.blocks.some((b) =>
      resolveImageUrl(b.iconUrl, jsonBase64Proj.images).startsWith('data:image/'),
    ),
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
  assert.ok(htmlCcfProj.images && Object.keys(htmlCcfProj.images).length > 0);
  assert.ok(
    htmlCcfProj.blocks.some((b) =>
      resolveImageUrl(b.iconUrl, htmlCcfProj.images).startsWith('data:image/'),
    ),
  );

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
  assert.ok(isImagePoolRef(reparsed.blocks[0]?.iconUrl));
  assert.equal(reparsed.blocks[0]?.iconUrl, reparsed.blocks[1]?.iconUrl);
  assert.equal(resolveImageUrl(reparsed.blocks[0]?.iconUrl, reparsed.images), dataUri);
  assert.equal(resolveImageUrl(reparsed.blocks[1]?.iconUrl, reparsed.images), dataUri);
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
  assert.equal(resolveImageUrl(reHtmlB64.blocks[1]?.iconUrl, reHtmlB64.images), dataUri);
  assert.equal(resolveImageUrl(reHtmlB64.blocks[2]?.iconUrl, reHtmlB64.images), dataUri);

  const jsonB64 = exportLog(proj, 'json', { encodeBase64: true, urlToBase64: urlMap });
  assert.equal(jsonB64.split(dataUri).length - 1, 1);
  const parsedJsonObj = JSON.parse(jsonB64);
  assert.ok(parsedJsonObj.images && Object.keys(parsedJsonObj.images).length === 1);
  assert.equal(parsedJsonObj.messages[1].iconUrl, undefined);
  assert.ok(typeof parsedJsonObj.messages[1].iconImage === 'string');
  const reJsonB64 = parse(jsonB64, 'b64.json');
  assert.equal(resolveImageUrl(reJsonB64.blocks[1]?.iconUrl, reJsonB64.images), dataUri);
  assert.equal(resolveImageUrl(reJsonB64.blocks[2]?.iconUrl, reJsonB64.images), dataUri);
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

import {
  addSceneForMessage,
  computeSceneRanges,
  findAdjacentScene,
  removeScene,
  updateSceneName,
} from './scenes.ts';

test('장면(북마크): 단일 메시지 중복 방지, 구간 계산, scene: 검색 필터, 이전/다음 전환', () => {
  const blocks = [
    { id: 'm1', speaker: 'GM', text: '오프닝 1', diceResult: '' },
    { id: 'm2', speaker: 'A', text: '도입 시작', diceResult: '' },
    { id: 'm3', speaker: 'B', text: '도입 대화', diceResult: '' },
    { id: 'm4', speaker: 'GM', text: '클라이맥스 진입', diceResult: '' },
    { id: 'm5', speaker: 'A', text: '마지막 결전', diceResult: '' },
  ];

  // m4에 먼저 등록 후 m2에 등록해도 블록 순서대로 정렬됨
  const r1 = addSceneForMessage([], blocks, 'm4', '클라이맥스');
  assert.ok(r1.added);
  assert.equal(r1.existing, null);

  // 같은 메시지에 중복 등록 불가
  const dup = addSceneForMessage(r1.scenes, blocks, 'm4', '중복 장면');
  assert.equal(dup.added, null);
  assert.equal(dup.existing?.id, r1.added.id);
  assert.equal(dup.scenes.length, 1);

  const r2 = addSceneForMessage(r1.scenes, blocks, 'm2', '도입부');
  assert.ok(r2.added);
  const scenes = r2.scenes;
  assert.deepEqual(
    scenes.map((s) => s.name),
    ['도입부', '클라이맥스'],
  );

  // 구간 계산: 도입부는 m2~m3 (2개), 클라이맥스는 m4~m5 (2개)
  const ranges = computeSceneRanges(scenes, blocks);
  assert.equal(ranges.length, 2);
  assert.equal(ranges[0].count, 2);
  assert.deepEqual([...ranges[0].blockIds], ['m2', 'm3']);
  assert.equal(ranges[1].count, 2);
  assert.deepEqual([...ranges[1].blockIds], ['m4', 'm5']);

  // scene: 검색 필터 및 -scene: 제외 필터
  const predIntro = compileQuery('scene:도입', [], scenes, blocks);
  assert.deepEqual(
    blocks.filter(predIntro).map((b) => b.id),
    ['m2', 'm3'],
  );
  const predExcl = compileQuery('-scene:도입', [], scenes, blocks);
  assert.deepEqual(
    blocks.filter(predExcl).map((b) => b.id),
    ['m1', 'm4', 'm5'],
  );

  // 이전/다음 장면 전환 (Ctrl+PgUp / PgDn)
  assert.equal(findAdjacentScene(scenes, blocks, 'm1', 1)?.messageId, 'm2');
  assert.equal(findAdjacentScene(scenes, blocks, 'm2', 1)?.messageId, 'm4');
  assert.equal(findAdjacentScene(scenes, blocks, 'm5', -1)?.messageId, 'm4');
  assert.equal(findAdjacentScene(scenes, blocks, 'm4', -1)?.messageId, 'm2');

  // 이름 변경 및 삭제
  const renamed = updateSceneName(scenes, blocks, r2.added.id, '1장 도입');
  assert.equal(renamed[0].name, '1장 도입');
  const afterRemove = removeScene(renamed, blocks, r2.added.id);
  assert.equal(afterRemove.length, 1);
  assert.equal(afterRemove[0].messageId, 'm4');
});

import { blank } from './core.ts';
import {
  createImportedLogItem,
  mergeImportedLogs,
  moveImportedItem,
  parseLogTimestamp,
} from './importManager.ts';

test('불러오기 매니저: 파일 순서 이동, 이어붙이기(Append/Insert/Interleave), 경계 중복 제거, 캐릭터·표정 병합, 장면 등록, 다중 원본 보존', () => {
  const raw1 = JSON.stringify({
    title: '1부',
    messages: [
      {
        type: 'normal',
        speaker: '몰토',
        color: '#b8342c',
        iconUrl: 'https://example.com/molto-1.png',
        timestamp: '2026. 10. 20. 오후 08:00:00',
        text: '1부 첫 대사',
      },
      {
        type: 'normal',
        speaker: '몰토',
        color: '#b8342c',
        iconUrl: 'https://example.com/molto-1.png',
        timestamp: '2026. 10. 20. 오후 08:05:00',
        text: '경계 중복 대사',
      },
    ],
  });

  const raw2 = JSON.stringify({
    title: '2부',
    messages: [
      {
        type: 'normal',
        speaker: '몰토',
        color: '#b8342c',
        iconUrl: 'https://example.com/molto-1.png',
        timestamp: '2026. 10. 20. 오후 08:05:00',
        text: '경계 중복 대사',
      },
      {
        type: 'normal',
        speaker: '몰토',
        color: '#b8342c',
        iconUrl: 'https://example.com/molto-2.png',
        timestamp: '2026. 10. 20. 오후 08:10:00',
        text: '2부 새 표정 대사',
      },
    ],
  });

  const item1 = createImportedLogItem('part1.json', raw1);
  const item2 = createImportedLogItem('part2.json', raw2);

  // 파일 순서 변경
  const moved = moveImportedItem([item1, item2], 0, 1);
  assert.deepEqual(
    moved.map((i) => i.name),
    ['part2.json', 'part1.json'],
  );

  // 빈 프로젝트에 다중 파일 Append + 경계 중복 제거 + 캐릭터·표정 병합 + 파일 시작점 장면 등록
  const mergedResult = mergeImportedLogs(blank(), [item1, item2], {
    mode: 'append',
    registerScenes: true,
    mergeCharacters: true,
    skipBoundaryDuplicates: true,
  });

  assert.equal(mergedResult.skippedDuplicateCount, 1);
  assert.equal(mergedResult.addedBlockCount, 3);
  assert.equal(mergedResult.project.blocks.length, 3);
  assert.deepEqual(
    mergedResult.project.blocks.map((b) => b.text),
    ['1부 첫 대사', '경계 중복 대사', '2부 새 표정 대사'],
  );

  // 다중 원본 보존 확인
  assert.equal(mergedResult.project.original.length, 2);
  assert.equal(mergedResult.project.original[0].name, 'part1.json');
  assert.equal(mergedResult.project.original[1].name, 'part2.json');

  // 동일 캐릭터 병합 및 표정(faces) 추가 확인
  const moltoChars = mergedResult.project.characters.filter((c) => c.name === '몰토');
  assert.equal(moltoChars.length, 1);
  assert.equal(moltoChars[0].faces.length, 2);

  // 파일 시작점 장면 북마크 등록 확인
  assert.deepEqual(
    mergedResult.project.scenes.map((s) => s.name),
    ['part1', 'part2'],
  );
  assert.equal(
    mergedResult.project.scenes[0].messageId,
    mergedResult.project.blocks[0].id,
  );
  assert.equal(
    mergedResult.project.scenes[1].messageId,
    mergedResult.project.blocks[2].id,
  );

  // 장면에 삽입 (Insert) 모드 확인: part2 장면 바로 앞에 삽입
  const rawInsert = JSON.stringify({
    messages: [{ type: 'normal', speaker: 'GM', text: '중간 삽입 나레이션' }],
  });
  const insertItem = createImportedLogItem('mid.json', rawInsert);
  const part2SceneId = mergedResult.project.scenes[1].id;
  const insertedResult = mergeImportedLogs(mergedResult.project, [insertItem], {
    mode: 'insert-scene',
    targetSceneId: part2SceneId,
    registerScenes: false,
    mergeCharacters: true,
    skipBoundaryDuplicates: false,
  });
  assert.deepEqual(
    insertedResult.project.blocks.map((b) => b.text),
    ['1부 첫 대사', '경계 중복 대사', '중간 삽입 나레이션', '2부 새 표정 대사'],
  );
  assert.equal(insertedResult.project.original.length, 3);

  // 시간순 정렬 (Interleave) 모드 및 타임스탬프 미기재 메시지 순서 보존 확인
  assert.ok(
    (parseLogTimestamp('2026. 10. 20. 오후 08:03:00') ?? 0) >
    (parseLogTimestamp('2026. 10. 20. 오후 08:00:00') ?? 0),
  );
  const rawSide = JSON.stringify({
    messages: [
      {
        type: 'normal',
        speaker: '서브',
        timestamp: '2026. 10. 20. 오후 08:02:00',
        text: '8시 2분 귓속말',
      },
      {
        type: 'normal',
        speaker: '서브',
        timestamp: '',
        text: '타임스탬프 없는 연속 귓속말',
      },
    ],
  });
  const sideItem = createImportedLogItem('side.json', rawSide);
  const interleaved = mergeImportedLogs(blank(), [item1, sideItem], {
    mode: 'interleave',
    registerScenes: false,
    mergeCharacters: true,
    skipBoundaryDuplicates: false,
  });
  assert.deepEqual(
    interleaved.project.blocks.map((b) => b.text),
    ['1부 첫 대사', '8시 2분 귓속말', '타임스탬프 없는 연속 귓속말', '경계 중복 대사'],
  );
});

test('내부 이미지 풀: oversized_json 중복 제거 직렬화, 미사용 이미지 정리, IndexedDB 자동저장', async () => {
  (globalThis as any).indexedDB = createMockIndexedDB();
  const oversizedRaw = fs.readFileSync('sample_log/oversized_json.json', 'utf8');
  const oversized = parse(oversizedRaw, 'oversized_json.json');

  assert.equal(oversized.blocks.length, 7108);
  assert.ok(oversized.images && Object.keys(oversized.images).length === 50);
  assert.ok(
    oversized.blocks.every((b) => !b.iconUrl || isImagePoolRef(b.iconUrl)),
    '모든 블록의 data:image는 내부 이미지 풀 참조(img:)로 저장되어야 함',
  );

  // 기존에는 ~2.86 GB 문자열 생성으로 Invalid string length가 발생했으나 이제 정상 직렬화 가능
  const serialized = JSON.stringify(oversized);
  assert.ok(serialized.length < 20 * 1024 * 1024);

  // project.json 왕복 및 IndexedDB 대용량 자동저장/복원 확인
  const roundtrip = parse(serialized, 'oversized.project.json');
  assert.equal(roundtrip.blocks.length, 7108);
  assert.equal(Object.keys(roundtrip.images ?? {}).length, 50);
  assert.equal(await saveAutosave(oversized), true);
  const restored = await loadAutosave();
  assert.ok(restored);
  assert.equal(restored.project.blocks.length, 7108);
  await clearAutosave();

  // 참조가 모두 사라진 이미지는 normalizeProjectImagePool에서 정리됨
  const pruned = normalizeProjectImagePool({
    ...roundtrip,
    characters: roundtrip.characters?.filter((c) => c.id === SYSTEM_CHARACTER_ID),
    blocks: [],
  });
  assert.equal(pruned.images, undefined);
});

test('스타일 시스템: 합연산 필터, 속성별 계층 충돌 해결(하단 우선), 사용처 해제·복제·삭제 및 HTML 출력', () => {
  const baseProj = blank();
  const cZeta = {
    id: 'c-zeta',
    name: '제타',
    color: '#6CD4BC',
    iconUrl: 'https://example.com/zeta.png',
    faces: [],
    styleIds: ['s-char'],
  };
  const blocks = [
    {
      id: 'b1',
      characterId: 'c-zeta',
      speaker: '제타',
      text: '성공적인 공격!',
      diceResult: '1D100<=50 ＞ 12 ＞ 성공',
      channel: '메인',
      sourceType: 'normal',
    },
    {
      id: 'b2',
      characterId: null,
      speaker: '알파',
      text: '귓속말 대화',
      diceResult: '',
      channel: '잡담',
      sourceType: 'normal',
      styleIds: ['s-char'],
    },
    {
      id: 'b3',
      characterId: null,
      speaker: '베타',
      text: '일반 대사',
      diceResult: '1D100<=50 ＞ 99 ＞ 실패',
      channel: '메인',
      sourceType: 'normal',
    },
  ];

  // 카드 1 (상단): from:제타 또는 in:잡담 (합연산 OR) -> 글씨체 serif, 패널색 #112233, 인장 원형
  let card1 = createStyleCard({
    id: 's-char',
    name: '제타 & 잡담 스타일',
    filters: ['from:제타'],
    props: {
      fontFamily: 'serif',
      panelBgColor: '#112233',
      avatarShape: 'circle',
    },
  });
  card1 = addFilterToStyleCard(card1, 'in:잡담');
  assert.deepEqual(card1.filters, ['from:제타', 'in:잡담']);

  // 카드 2 (하단 - 우선도 높음): dice:성공 -> 패널색 #334455(충돌 시 하단 우선!), 주사위 글자색 #00FF88
  // 글씨체와 인장 모양은 지정하지 않았으므로 카드 1의 결과가 유지되어야 함
  const card2 = createStyleCard({
    id: 's-dice',
    name: '성공 판정 강조',
    filters: ['dice:성공'],
    props: {
      panelBgColor: '#334455',
      diceTextColor: '#00FF88',
      diceFontWeight: 'bold',
    },
  });

  const styles = defaultProjectStyles();
  styles.global.pageBgColor = '#101520';
  styles.global.messageDefaults = { fontSize: 17 };
  styles.cards = [card1, card2];

  const proj = {
    ...baseProj,
    characters: [...(baseProj.characters ?? []), cZeta],
    blocks,
    styles,
  };

  const resolve = createStyleResolver(proj.styles, proj.characters, [], proj.blocks);

  // b1(제타 + 성공 판정): 카드 1과 카드 2가 동시에 적용됨
  // - fontSize: 전역 기본값 17 유지
  // - fontFamily, avatarShape: 카드 1 유지 ('serif', 'circle')
  // - panelBgColor: 같은 속성 충돌 -> 아래쪽인 카드 2('#334455')가 우선 적용
  // - diceTextColor: 카드 2('#00FF88') 적용
  const r1 = resolve(blocks[0]);
  assert.equal(r1.fontSize, 17);
  assert.equal(r1.fontFamily, 'serif');
  assert.equal(r1.avatarShape, 'circle');
  assert.equal(r1.panelBgColor, '#334455');
  assert.equal(r1.diceTextColor, '#00FF88');

  // b2(잡담 채널): 카드 1의 두 번째 필터('in:잡담') 합연산으로 카드 1 적용
  const r2 = resolve(blocks[1]);
  assert.equal(r2.panelBgColor, '#112233');
  assert.equal(r2.diceTextColor, undefined);

  // 드래그 순서 변경: 카드 1을 카드 2 아래로 이동하면 카드 1의 panelBgColor('#112233')가 우선함
  const movedCards = moveStyleCard(styles.cards, 0, 1, true);
  assert.deepEqual(
    movedCards.map((c) => c.id),
    ['s-dice', 's-char'],
  );
  const resolveAfterMove = createStyleResolver(
    { ...styles, cards: movedCards },
    proj.characters,
    [],
    proj.blocks,
  );
  assert.equal(resolveAfterMove(blocks[0]).panelBgColor, '#112233');

  // 스타일 카드 복제 검증
  const duplicated = duplicateStyleCard(styles, 's-char');
  assert.equal(duplicated.cards.length, 3);
  assert.notEqual(duplicated.cards[1].id, 's-char');
  assert.deepEqual(duplicated.cards[1].filters, ['from:제타', 'in:잡담']);

  // 사용처(필터·캐릭터·메시지) 조회 및 개별 해제(X 버튼)
  const usages = collectStyleCardUsages(card1, proj);
  assert.equal(usages.length, 4); // 필터 2개 + 캐릭터 1개 + 메시지 1개
  const afterUnlinkFilter = unlinkStyleUsageFromProject(proj, 's-char', usages[0]);
  assert.deepEqual(afterUnlinkFilter.styles?.cards[0].filters, ['in:잡담']);

  // 스타일 삭제 시 연결된 필터·캐릭터·메시지 참조가 모두 해제됨
  const afterDelete = removeStyleCardFromProject(proj, 's-char');
  assert.equal(afterDelete.styles?.cards.length, 1);
  assert.equal(
    afterDelete.characters?.find((c) => c.id === 'c-zeta')?.styleIds,
    undefined,
  );
  assert.equal(afterDelete.blocks.find((b) => b.id === 'b2')?.styleIds, undefined);

  // 프로젝트 JSON 왕복 및 HTML 내보내기 스타일 반영 확인
  const roundtripProj = parse(JSON.stringify(proj), 'styled.project.json');
  assert.equal(roundtripProj.styles?.cards.length, 2);
  const exportedHtml = exportLog(roundtripProj, 'html');
  assert.ok(exportedHtml.includes('background:#101520'));
  assert.ok(exportedHtml.includes('background-color:#334455'));
  assert.ok(exportedHtml.includes('color:#00FF88'));
});

test('스타일 확장: 전역 시스템 메시지 스타일, 아바타 사용 안함(avatarHidden) 및 HTML 내보내기', () => {
  const baseProj = blank();
  const cAlpha = {
    id: 'c-alpha',
    name: '알파',
    color: '#6CD4BC',
    iconUrl: 'https://example.com/alpha.png',
    faces: [],
  };
  const blocks = [
    {
      id: 'n1',
      characterId: 'c-alpha',
      speaker: '알파',
      text: '일반 대사',
      diceResult: '',
      channel: '메인',
      sourceType: 'normal',
    },
    {
      id: 'n2',
      characterId: 'c-alpha',
      speaker: '알파',
      text: '나레이션 대사',
      diceResult: '',
      channel: '나레이션',
      sourceType: 'normal',
    },
    {
      id: 's1',
      characterId: 'builtin:system',
      text: '시스템 안내',
      diceResult: '',
      channel: '메인',
      sourceType: 'system',
    },
  ];

  const styles = defaultProjectStyles();
  styles.global.messageDefaults = { textColor: '#EEEEEE', panelBgColor: '#1A1A1A' };
  styles.global.systemDefaults = {
    textColor: '#AABBCC',
    fontStyle: 'italic',
    panelBgColor: '#222630',
  };
  styles.cards = [
    createStyleCard({
      id: 'card-narration',
      name: '나레이션(아바타 숨김)',
      filters: ['in:나레이션'],
      props: { avatarHidden: true },
    }),
  ];

  const proj = {
    ...baseProj,
    characters: [...(baseProj.characters ?? []), cAlpha],
    blocks,
    styles,
  };

  const resolve = createStyleResolver(proj.styles, proj.characters, [], proj.blocks);
  // 시스템 메시지는 전역 일반 패널색(#1A1A1A)이나 일반 대사색을 덮어쓰지 않고 systemDefaults를 따름
  const sysStyle = resolve(blocks[2]);
  assert.equal(sysStyle.textColor, '#AABBCC');
  assert.equal(sysStyle.fontStyle, 'italic');
  assert.equal(sysStyle.panelBgColor, '#222630');

  // 아바타 숨김 카드 매칭 확인
  assert.equal(resolve(blocks[0]).avatarHidden, undefined);
  assert.equal(resolve(blocks[1]).avatarHidden, true);

  // HTML 내보내기에서 no-avatar 클래스 및 아바타 생략 + 시스템 스타일 확인
  const html = exportLog(proj, 'html');
  assert.ok(html.includes('<article class="message" data-channel="main"'));
  assert.ok(html.includes('<article class="message no-avatar" data-channel="나레이션"'));
  assert.ok(html.includes('color:#AABBCC'));
  assert.ok(html.includes('background-color:#222630'));

  // 저장·재열기 시 systemDefaults와 avatarHidden 보존 확인
  const roundtrip = parse(JSON.stringify(proj), 'extended-styles.project.json');
  assert.equal(roundtrip.styles?.global.systemDefaults.textColor, '#AABBCC');
  assert.equal(roundtrip.styles?.global.systemDefaults.fontStyle, 'italic');
  assert.equal(roundtrip.styles?.cards[0].props.avatarHidden, true);
});

test('스타일 확장 2: 화자 색 테두리, 점선 테두리, 아바타 배경색, 정렬, 패딩 및 메시지 간격', () => {
  const styled = buildMessageStyleObjects(
    {
      panelShape: 'rounded',
      panelBorderStyle: 'box',
      panelBorderLineStyle: 'dashed',
      panelBorderColor: 'speaker',
      panelPaddingY: 10,
      panelPaddingX: 18,
      avatarSize: 56,
      avatarBgColor: '#1D2530',
      avatarBorderLineStyle: 'dotted',
      avatarBorderColor: 'speaker',
      avatarBorderWidth: 2,
      textAlign: 'center',
      diceBorderStyle: 'left-accent',
      diceBorderLineStyle: 'dashed',
      diceBorderColor: 'speaker',
      diceAlign: 'right',
    },
    '#262626',
    '#B8342C',
  );

  assert.equal(styled.panelStyle.border, '1px dashed #B8342C');
  assert.equal(styled.panelStyle.borderRadius, '6px');
  assert.equal(styled.panelStyle.padding, '10px 18px');
  assert.equal(
    buildMessageStyleObjects({ panelShape: 'rounded', panelRadius: 12 }).panelStyle.borderRadius,
    '12px',
  );
  assert.equal(
    buildMessageStyleObjects({ panelShape: 'square' }).panelStyle.borderRadius,
    '0px',
  );
  assert.equal(styled.panelStyle.gridTemplateColumns, '56px minmax(0, 1fr)');
  assert.equal(styled.avatarStyle.width, '56px');
  assert.equal(styled.avatarStyle.height, '56px');
  assert.equal(styled.avatarStyle.backgroundColor, '#1D2530');
  assert.equal(styled.avatarStyle.border, '2px dotted #B8342C');
  assert.equal(styled.textStyle.textAlign, 'center');
  assert.equal(styled.diceStyle.borderLeft, '2px dashed #B8342C');
  assert.equal(styled.diceStyle.textAlign, 'right');
  assert.equal(styled.diceStyle.display, 'block');

  const noBorderStyled = buildMessageStyleObjects(
    {
      panelBorderColor: 'none',
      avatarBorderColor: 'none',
      diceBorderColor: 'none',
    },
    '#262626',
    '#B8342C',
  );
  assert.equal(noBorderStyled.panelStyle.border, 'none');
  assert.equal(noBorderStyled.avatarStyle.border, 'none');
  assert.equal(noBorderStyled.diceStyle.border, 'none');

  const baseProj = blank();
  const styles = defaultProjectStyles();
  styles.global.messageGap = 8;
  styles.global.messageDefaults = {
    panelPaddingY: 9,
    panelPaddingX: 12,
    avatarBgColor: '#1D2530',
    panelBorderLineStyle: 'dashed',
    panelBorderColor: 'speaker',
    textAlign: 'center',
  };
  const proj = {
    ...baseProj,
    blocks: [
      {
        id: 'b1',
        characterId: null,
        speaker: '레드',
        color: '#B8342C',
        text: '가운데 정렬 대사',
        diceResult: '',
        channel: '메인',
        sourceType: 'normal',
      },
    ],
    styles,
  };

  const html = exportLog(proj, 'html');
  assert.ok(html.includes('gap:8px'));
  assert.ok(html.includes('padding:9px 12px'));
  assert.ok(html.includes('border-bottom:1px dashed #B8342C'));
  assert.ok(html.includes('text-align:center'));

  const reloaded = parse(JSON.stringify(proj), 'gap-padding.project.json');
  assert.equal(reloaded.styles?.global.messageGap, 8);
  assert.equal(reloaded.styles?.global.messageDefaults.panelPaddingY, 9);
  assert.equal(reloaded.styles?.global.messageDefaults.avatarBgColor, '#1D2530');
  assert.equal(reloaded.styles?.global.messageDefaults.panelBorderColor, 'speaker');
});

test('컬러 입력 유틸: # 자동 제거(직접 입력·붙여넣기), 저장값 변환, 대비 글자색 계산', () => {
  // # 직접 입력 및 클립보드 붙여넣기 시 #·공백 자동 제거, 대문자 변환 및 6자리 유지
  assert.equal(normalizeColorCodeInput('#123456'), '123456');
  assert.equal(normalizeColorCodeInput(' #aBcDeF '), 'ABCDEF');
  assert.equal(normalizeColorCodeInput('12#3456'), '123456');
  assert.equal(normalizeColorCodeInput('###'), '');
  assert.equal(normalizeColorCodeInput('#12345678'), '123456');
  assert.equal(normalizeColorCodeInput('abcdef'), 'ABCDEF');

  // 표시용/저장용 변환 (모두 대문자)
  assert.equal(formatColorCodeForInput('#6cd4bc'), '6CD4BC');
  assert.equal(formatColorCodeForInput(''), '');
  assert.equal(toStoredColorValue('#ff00aa'), '#FF00AA');
  assert.equal(toStoredColorValue('ff00aa'), '#FF00AA');
  assert.equal(toStoredColorValue('#'), '');

  // 피커 색상 폴백 (유효하면 대문자 반환)
  assert.equal(resolvePickerColor('#123abc'), '#123ABC');
  assert.equal(resolvePickerColor('#123'), '#888888');
  assert.equal(resolvePickerColor(''), '#888888');

  // 배경색 명도에 따른 # 글자색(흰색/검은색) 결정
  assert.equal(getContrastTextColor('#000000'), '#ffffff');
  assert.equal(getContrastTextColor('#161c24'), '#ffffff');
  assert.equal(getContrastTextColor('#0000ff'), '#ffffff');
  assert.equal(getContrastTextColor('#ffffff'), '#000000');
  assert.equal(getContrastTextColor('#6cd4bc'), '#000000');
  assert.equal(getContrastTextColor('#ffff00'), '#000000');
  assert.equal(getContrastTextColor('#888888'), '#000000');
});

test('개별 메시지 스타일 요약 칩/전체 해제, 일괄 스타일 편집, style: 검색 필터', () => {
  const styles = defaultProjectStyles();
  const sEmp = createStyleCard({ id: 's-emp', name: '강조 연출', props: { panelBgColor: '#223344' } });
  const sDice = createStyleCard({
    id: 's-dice',
    name: '치명타',
    filters: ['dice:크리티컬'],
    props: { textColor: '#FFDD55' },
  });
  // 순환 참조 방지 검증용 상호 참조 필터
  const sLoopA = createStyleCard({
    id: 's-loop-a',
    name: '순환 A',
    filters: ['style:"순환 B"'],
  });
  const sLoopB = createStyleCard({
    id: 's-loop-b',
    name: '순환 B',
    filters: ['style:"순환 A"'],
  });
  styles.cards = [sEmp, sDice, sLoopA, sLoopB];

  const cAlpha = {
    id: 'c-alpha',
    name: '알파',
    color: '#6CD4BC',
    iconUrl: '',
    faces: [],
    styleIds: ['s-emp'],
  };

  const b1 = {
    id: 'b1',
    characterId: null,
    speaker: '베타',
    text: '직접 강조 1',
    diceResult: '',
    channel: '메인',
    sourceType: 'normal',
    styleIds: ['s-emp', 's-dice'],
  };
  const b2 = {
    id: 'b2',
    characterId: null,
    speaker: '베타',
    text: '직접 강조 2',
    diceResult: '',
    channel: '메인',
    sourceType: 'normal',
    styleIds: ['s-emp'],
  };
  const b3 = {
    id: 'b3',
    characterId: 'c-alpha',
    speaker: '알파',
    text: '캐릭터 스타일 메시지',
    diceResult: '1D100<=50 크리티컬',
    channel: '메인',
    sourceType: 'normal',
  };
  const b4 = {
    id: 'b4',
    characterId: null,
    speaker: '감마',
    text: '스타일 없는 메시지',
    diceResult: '',
    channel: '메인',
    sourceType: 'normal',
  };

  const proj = {
    ...blank(),
    characters: [cAlpha],
    blocks: [b1, b2, b3, b4],
    styles,
  };

  // 1) 개별 메시지 N건 단일 요약 칩 및 X 버튼 전체 해제
  const usages = collectStyleCardUsages(sEmp, proj);
  const msgSummary = usages.find((u) => u.kind === 'messages');
  assert.ok(msgSummary && msgSummary.kind === 'messages');
  assert.equal(msgSummary.count, 2);
  assert.equal(msgSummary.label, '개별 메시지 2건');

  const afterUnlinkMsgs = unlinkStyleUsageFromProject(proj, 's-emp', msgSummary);
  assert.deepEqual(afterUnlinkMsgs.blocks.find((x) => x.id === 'b1')?.styleIds, [
    's-dice',
  ]);
  assert.equal(afterUnlinkMsgs.blocks.find((x) => x.id === 'b2')?.styleIds, undefined);
  // 캐릭터 연결은 유지
  assert.deepEqual(afterUnlinkMsgs.characters?.[0].styleIds, ['s-emp']);

  // 2) 일괄 편집 3상태 체크박스 (all / mixed / none) 및 단일 커밋 적용
  const targetBlocks = [b1, b2];
  assert.equal(getBulkStyleCheckboxState('s-emp', targetBlocks), 'checked');
  assert.equal(getBulkStyleCheckboxState('s-dice', targetBlocks), 'mixed');

  // mixed -> add (전체 적용) -> remove (전체 해제) -> mixed (유지)
  let ops = toggleBulkStyleOp('s-dice', targetBlocks, undefined);
  assert.equal(getBulkStyleCheckboxState('s-dice', targetBlocks, ops), 'checked');
  ops = toggleBulkStyleOp('s-dice', targetBlocks, ops);
  assert.equal(getBulkStyleCheckboxState('s-dice', targetBlocks, ops), 'unchecked');
  ops = toggleBulkStyleOp('s-dice', targetBlocks, ops);
  assert.equal(ops, undefined);
  assert.equal(getBulkStyleCheckboxState('s-dice', targetBlocks, ops), 'mixed');

  const bulk = createBulkEditState('b1', new Set(['b1', 'b2']), b1);
  bulk.styleOps = { 's-dice': 'add', 's-emp': 'remove' };
  const afterBulk = applyBulkEditToProject(proj, bulk);
  assert.deepEqual(afterBulk.blocks.find((x) => x.id === 'b1')?.styleIds, ['s-dice']);
  assert.deepEqual(afterBulk.blocks.find((x) => x.id === 'b2')?.styleIds, ['s-dice']);

  // 3) style: / -style: / style:none 검색 필터 및 칩 포맷팅
  const parsed = parseQueryToChipsAndText('style:"강조 연출" -style:치명타');
  assert.equal(parsed.chips.length, 2);
  assert.equal(parsed.chips[0].key, 'style');
  assert.equal(formatChipDisplay(parsed.chips[0]).label, '강조 연출');
  assert.equal(formatChipDisplay(parsed.chips[1]).icon, '-🎨');

  const byEmp = compileQuery('style:"강조 연출"', [cAlpha], [], proj.blocks, styles.cards);
  assert.deepEqual(
    proj.blocks.filter(byEmp).map((x) => x.id),
    ['b1', 'b2', 'b3'],
  );

  const byDice = compileQuery('style:치명타', [cAlpha], [], proj.blocks, styles.cards);
  assert.deepEqual(
    proj.blocks.filter(byDice).map((x) => x.id),
    ['b1', 'b3'],
  );

  const exclDice = compileQuery('-style:치명타', [cAlpha], [], proj.blocks, styles.cards);
  assert.deepEqual(
    proj.blocks.filter(exclDice).map((x) => x.id),
    ['b2', 'b4'],
  );

  const noStyle = compileQuery('style:none', [cAlpha], [], proj.blocks, styles.cards);
  assert.deepEqual(
    proj.blocks.filter(noStyle).map((x) => x.id),
    ['b4'],
  );

  // 순환 스타일 참조 시 무한 재귀 없이 false 반환
  const loopPred = compileQuery('style:"순환 A"', [cAlpha], [], proj.blocks, styles.cards);
  assert.deepEqual(proj.blocks.filter(loopPred), []);
});

import { binarySearchFirst, binarySearchLast } from './useVirtualScroll.ts';
test('가상 스크롤 이진 탐색 및 가시 범위 계산', () => {
  // 5개 아이템 각각 높이 100px: [0, 100, 200, 300, 400, 500]
  const positions = new Float64Array([0, 100, 200, 300, 400, 500]);
  const count = 5;

  // 1) 스크롤 맨 위 (scrollTop=0, viewport=250): 아이템 0, 1, 2가 뷰포트 내에 포함
  assert.equal(binarySearchFirst(positions, 0, count), 0);
  assert.equal(binarySearchLast(positions, 250, count), 2);

  // 2) 스크롤 중간 (scrollTop=150, viewport=200, bottom=350): 아이템 1(100~200), 2(200~300), 3(300~400)
  assert.equal(binarySearchFirst(positions, 150, count), 1);
  assert.equal(binarySearchLast(positions, 350, count), 3);

  // 3) 스크롤 끝 (scrollTop=450, viewport=200, bottom=650): 아이템 4(400~500)
  assert.equal(binarySearchFirst(positions, 450, count), 4);
  assert.equal(binarySearchLast(positions, 650, count), 4);

  // 4) 빈 배열 (count=0)
  assert.equal(binarySearchFirst(new Float64Array([0]), 100, 0), 0);
  assert.equal(binarySearchLast(new Float64Array([0]), 100, 0), 0);
});

test('화자 글씨 크기(speakerFontSize) 정규화 및 HTML 내보내기', () => {
  const norm = normalizeMessageStyleProps({ speakerFontSize: 18.4 });
  assert.equal(norm.speakerFontSize, 18);
  assert.equal(normalizeMessageStyleProps({ speakerFontSize: 5 }).speakerFontSize, undefined);

  const built = buildMessageStyleObjects({ speakerFontSize: 20 });
  assert.equal(built.speakerFontSize, 20);

  const baseStyles = defaultProjectStyles();
  const proj = {
    format: 'log-studio' as const,
    version: 1 as const,
    title: '화자 크기 테스트',
    original: [],
    characters: [{ id: 'c1', name: '라르코', color: '#6CD4BC' }],
    blocks: [{ id: 'b1', sourceType: 'chat' as const, characterId: 'c1', speaker: '라르코', text: '안녕' }],
    display: { ...defaultDisplay },
    styles: {
      ...baseStyles,
      global: {
        ...baseStyles.global,
        messageDefaults: { ...baseStyles.global.messageDefaults, speakerFontSize: 22 },
      },
    },
  };
  const html = exportLog(proj, 'html');
  assert.ok(html.includes('font-size:22px'));
});

test('마름모(diamond) 인장: 틀 45도 회전(70.71%) 및 내부 역회전(141.42%), HTML 내보내기 및 왕복 파싱', () => {
  const diamondStyled = buildMessageStyleObjects({
    avatarShape: 'diamond',
    avatarSize: 40,
    avatarBorderWidth: 2,
    avatarBorderColor: '#FF0000',
    avatarBgColor: '#112233',
  });
  assert.equal(diamondStyled.avatarShape, 'diamond');
  assert.equal(diamondStyled.avatarFrameStyle.width, '70.7107%');
  assert.equal(diamondStyled.avatarFrameStyle.height, '70.7107%');
  assert.equal(diamondStyled.avatarFrameStyle.transform, 'rotate(45deg)');
  assert.equal(diamondStyled.avatarFrameStyle.border, '2px solid #FF0000');
  assert.equal(diamondStyled.avatarFrameStyle.backgroundColor, '#112233');
  assert.equal(diamondStyled.avatarInnerStyle.width, '141.4214%');
  assert.equal(diamondStyled.avatarInnerStyle.height, '141.4214%');
  assert.equal(diamondStyled.avatarInnerStyle.transform, 'rotate(-45deg)');

  const circleStyled = buildMessageStyleObjects({
    avatarShape: 'circle',
    avatarSize: 40,
  });
  assert.equal(circleStyled.avatarShape, 'circle');
  assert.equal(circleStyled.avatarFrameStyle.width, '100%');
  assert.equal(circleStyled.avatarFrameStyle.borderRadius, '50%');
  assert.equal(circleStyled.avatarInnerStyle.width, '100%');

  const baseStyles = defaultProjectStyles();
  const proj = {
    format: 'log-studio' as const,
    version: 1 as const,
    title: '마름모 인장 테스트',
    original: [],
    characters: [{ id: 'c1', name: '알파', color: '#6CD4BC', iconUrl: 'https://example.com/alpha.png' }],
    blocks: [{
      id: 'b1',
      sourceType: 'normal' as const,
      characterId: 'c1',
      speaker: '알파',
      text: '마름모 인장 테스트 대사',
      iconUrl: 'https://example.com/alpha.png',
    }],
    display: { ...defaultDisplay },
    styles: {
      ...baseStyles,
      global: {
        ...baseStyles.global,
        messageDefaults: {
          ...baseStyles.global.messageDefaults,
          avatarShape: 'diamond' as const,
          avatarBorderWidth: 2,
          avatarBorderColor: '#FF0000',
        },
      },
    },
  };
  const html = exportLog(proj, 'html');
  assert.ok(html.includes('class="avatar is-diamond"'));
  assert.ok(html.includes('class="avatar-frame is-diamond"'));
  assert.ok(html.includes('class="avatar-inner avatar-image-0"'));
  assert.ok(html.includes('.avatar.is-diamond'));

  const reparsed = parse(html, 'diamond.html');
  assert.equal(reparsed.blocks.length, 1);
  assert.equal(resolveImageUrl(reparsed.blocks[0]?.iconUrl, reparsed.images), 'https://example.com/alpha.png');
});

test('메시지 라인 번호(Ctrl+G) 파싱 및 유효성 검증', () => {
  const parseLineNumber = (input: string, total: number) => {
    const raw = input.trim().replace(/^[#:]/, '');
    if (!raw) return null;
    const n = parseInt(raw, 10);
    return !isNaN(n) && n >= 1 && n <= total ? n : null;
  };

  assert.equal(parseLineNumber('333', 500), 333);
  assert.equal(parseLineNumber('#333', 500), 333);
  assert.equal(parseLineNumber(':333', 500), 333);
  assert.equal(parseLineNumber(' #42 ', 500), 42);
  assert.equal(parseLineNumber('0', 500), null);
  assert.equal(parseLineNumber('501', 500), null);
  assert.equal(parseLineNumber('-5', 500), null);
  assert.equal(parseLineNumber('abc', 500), null);
  assert.equal(parseLineNumber('', 500), null);
});

test('스크롤바 오버레이 연속 인덱스 구간 병합(collapseToRanges)', () => {
  assert.deepEqual(collapseToRanges([]), []);
  assert.deepEqual(collapseToRanges([0]), [{ start: 0, end: 0 }]);
  assert.deepEqual(collapseToRanges([0, 1, 2, 5, 8, 9, 10]), [
    { start: 0, end: 2 },
    { start: 5, end: 5 },
    { start: 8, end: 10 },
  ]);
  assert.deepEqual(collapseToRanges([3, 4, 5, 6]), [{ start: 3, end: 6 }]);

  // 단일 불연속 인덱스들
  assert.deepEqual(collapseToRanges([1, 3, 5, 7]), [
    { start: 1, end: 1 },
    { start: 3, end: 3 },
    { start: 5, end: 5 },
    { start: 7, end: 7 },
  ]);

  // 시각적 겹침(픽셀 거리 기반) 병합: 5000개 메시지, 트랙 높이 500px (1개당 0.1px), 최소 마커 2px
  // 인덱스 100(10.0px) ~ 115(11.5px)은 2px 이내이므로 하나로 병합되고, 125(12.5px)는 분리됨
  assert.deepEqual(
    collapseToRanges([100, 110, 115, 125], {
      totalCount: 5000,
      trackHeightPx: 500,
      minMarkerPx: 2,
    }),
    [
      { start: 100, end: 115 },
      { start: 125, end: 125 },
    ],
  );

  // 스크롤바 썸 높이 추정 및 가동 범위 보정 테스트
  assert.equal(computeThumbHeight(500, 500, 500), 0); // 스크롤 불필요
  assert.equal(computeThumbHeight(500, 2500, 500), 100); // 500/2500 * 500 = 100px
  assert.equal(computeThumbHeight(500, 50000, 500, 30), 30); // 최소 30px 보장

  // 트랙 500px, 썸 100px일 때: offset = 50px(10%), travel = 400px(80%)
  const firstBounds = getMarkerBoundsPercent(0, 0, 100, 500, 100);
  assert.equal(firstBounds.topPercent, 10); // 50 / 500 = 10%
  const midBounds = getMarkerBoundsPercent(50, 50, 100, 500, 100);
  assert.equal(midBounds.topPercent, 50); // 50 + 0.5*400 = 250 -> 50%
  const endBounds = getMarkerBoundsPercent(99, 99, 100, 500, 100);
  // 50 + 0.99*400 = 446 -> 89.2% (썸 중심 범위 내)
  assert.ok(Math.abs(endBounds.topPercent - 89.2) < 0.01);

  // 썸 가동 범위(400px) 내 시각적 겹침 병합 테스트
  assert.deepEqual(
    collapseToRanges([0, 1, 2, 10], {
      totalCount: 1000,
      trackHeightPx: 500,
      thumbHeightPx: 100, // travel = 400px -> 1개당 0.4px
      minMarkerPx: 2,
    }),
    [
      { start: 0, end: 2 }, // 0~2는 연속이고 2의 end=1.2px, min=2px. 10의 top=4px > 2px이므로 분리
      { start: 10, end: 10 },
    ],
  );
});

test('설정 탭 신규 옵션: 병합 구분자, 미사용 이미지 통계·정리, 스타일 프리셋 왕복 및 원본 제외 저장', () => {
  // 1) 연속 병합 줄바꿈 형식
  assert.equal(resolveMergeSeparator('newline'), '\n');
  assert.equal(resolveMergeSeparator('doubleNewline'), '\n\n');
  assert.equal(resolveMergeSeparator('space'), ' ');

  const sampleProj = parse(
    JSON.stringify({
      messages: [
        { speaker: 'A', text: '첫 번째' },
        { speaker: 'A', text: '두 번째' },
      ],
    }),
    'merge.json',
  );
  const mergedDouble = mergeConsecutive(
    sampleProj.blocks,
    undefined,
    resolveMergeSeparator('doubleNewline'),
  );
  assert.equal(mergedDouble.length, 1);
  assert.equal(mergedDouble[0]?.text, '첫 번째\n\n두 번째');

  const mergedSpace = mergeConsecutive(
    sampleProj.blocks,
    undefined,
    resolveMergeSeparator('space'),
  );
  assert.equal(mergedSpace[0]?.text, '첫 번째 두 번째');

  // 2) internProjectImages는 미사용 이미지를 유지해 수동 정리 통계 감지 가능
  const dataUri1 = 'data:image/png;base64,AAAA1111';
  const dataUri2 = 'data:image/png;base64,BBBB2222';
  const withTwoImages = internProjectImages({
    ...sampleProj,
    blocks: [
      { ...sampleProj.blocks[0]!, iconUrl: dataUri1 },
      { ...sampleProj.blocks[1]!, iconUrl: dataUri2 },
    ],
  });
  assert.equal(getUnusedImageStats(withTwoImages).unusedCount, 0);

  // 두 번째 블록 아이콘 제거 후 internProjectImages를 돌리면 미참조 1개가 남아있음
  const afterRemoveIcon = internProjectImages({
    ...withTwoImages,
    blocks: [withTwoImages.blocks[0]!, { ...withTwoImages.blocks[1]!, iconUrl: '' }],
  });
  const stats = getUnusedImageStats(afterRemoveIcon);
  assert.equal(stats.totalCount, 2);
  assert.equal(stats.unusedCount, 1);
  assert.equal(stats.unusedBytes, dataUri2.length);

  // 수동 정리(normalizeProjectImagePool) 실행 시 미참조 이미지 제거됨
  const cleaned = normalizeProjectImagePool(afterRemoveIcon);
  assert.equal(getUnusedImageStats(cleaned).totalCount, 1);
  assert.equal(getUnusedImageStats(cleaned).unusedCount, 0);

  // 3) 스타일 카드 설정 내보내기 / 불러오기 왕복
  const baseStyles = defaultProjectStyles();
  baseStyles.global.pageBgColor = '#123456';
  const card = createStyleCard({ name: '강조 카드', filters: ['speaker:A'] }, 1);
  card.props.textColor = '#ABCDEF';
  baseStyles.cards.push(card);

  const presetJson = exportStylesConfig(baseStyles);
  const imported = parseStylesConfig(presetJson);
  assert.equal(imported.global.pageBgColor, '#123456');
  assert.equal(imported.cards.length, 1);
  assert.equal(imported.cards[0]?.name, '강조 카드');
  assert.equal(imported.cards[0]?.props.textColor, '#ABCDEF');

  assert.throws(() => parseStylesConfig('{invalid-json'), /JSON/);
  assert.throws(() => parseStylesConfig('{"foo":"bar"}'), /유효한 스타일/);

  // 4) display 신규 설정 및 원본 제외 저장 호환성
  const noOriginalProj = {
    ...sampleProj,
    original: [],
    display: {
      showChannel: true,
      showTimestamp: true,
      timestampFormat: 'original',
      mergeSeparator: 'doubleNewline' as const,
      mergeDifferentFaces: true,
      autoWrapQuotes: false,
      maxUndoSteps: 50,
      showScrollbarOverlay: false,
      preserveOriginals: false,
    },
  };
  const roundtrip = parse(JSON.stringify(noOriginalProj), 'stripped.project.json');
  assert.equal(roundtrip.original.length, 0);
  assert.equal(roundtrip.display?.mergeSeparator, 'doubleNewline');
  assert.equal(roundtrip.display?.mergeDifferentFaces, true);
  assert.equal(roundtrip.display?.autoWrapQuotes, false);
  assert.equal(roundtrip.display?.maxUndoSteps, 50);
  assert.equal(roundtrip.display?.showScrollbarOverlay, false);
  assert.equal(roundtrip.display?.preserveOriginals, false);
});

test('빠른 캐릭터 전환 슬롯: 저장·불러오기·해제 및 project.json/이미지풀 보존', () => {
  // 1) 단축키 숫자 인식
  assert.equal(getQuickSlotNumber({ key: '1', code: 'Digit1' }), 1);
  assert.equal(getQuickSlotNumber({ key: '9', code: 'Digit9' }), 9);
  assert.equal(getQuickSlotNumber({ key: '!', code: 'Digit1' }), 1);
  assert.equal(getQuickSlotNumber({ key: '0', code: 'Digit0' }), null);
  assert.equal(getQuickSlotNumber({ key: 'a', code: 'KeyA' }), null);

  // 2) 블록에서 슬롯 생성 (채널 미포함) & 슬롯 등록/해제
  const base = parse(
    JSON.stringify({
      messages: [
        { speaker: '아린', channelName: '잡담', iconUrl: 'https://example.com/a.png', text: '안녕' },
        { speaker: '사용자지정', channelName: '메인', iconUrl: 'data:image/png;base64,QQ==', color: '#112233', text: '커스텀' },
      ],
    }),
    'quick.json',
  );
  const slot1 = createSlotFromBlock(base.blocks[0]!, base.characters ?? []);
  assert.equal(slot1.speaker, '아린');
  assert.ok(slot1.characterId);
  assert.equal('channel' in slot1, false);

  let slots = setQuickCharacterSlot(undefined, 1, slot1);
  slots = setQuickCharacterSlot(slots, 2, createSlotFromBlock(base.blocks[1]!, base.characters ?? []));
  assert.equal(Object.keys(slots).length, 2);

  // 캐릭터 이름 변경 시 연동 슬롯은 최신 이름 반영
  const renamedChars = (base.characters ?? []).map((c) =>
    c.id === slot1.characterId ? { ...c, name: '아린(개명)' } : c,
  );
  const resolved1 = resolveQuickSlotForComposer(slots['1']!, renamedChars);
  assert.equal(resolved1.speaker, '아린(개명)');

  // 슬롯 해제
  const afterRemove = removeQuickCharacterSlot(slots, 1);
  assert.equal(afterRemove?.['1'], undefined);
  assert.ok(afterRemove?.['2']);

  const empty = removeQuickCharacterSlot(afterRemove, 2);
  assert.equal(empty, undefined);

  // 3) project.json 왕복 및 quickSlots 내 base64 이미지 참조 보존
  const withSlots = {
    ...base,
    quickSlots: slots,
  };
  const roundtrip = parse(JSON.stringify(withSlots), 'slots.project.json');
  assert.ok(roundtrip.quickSlots?.['1']);
  assert.ok(roundtrip.quickSlots?.['2']);
  assert.ok(isImagePoolRef(roundtrip.quickSlots?.['2']?.iconUrl));

  // 블록에서 커스텀 화자 메시지를 지워도 슬롯에 남아있으면 미참조로 정리되지 않음
  const onlySlotRef = normalizeProjectImagePool({
    ...roundtrip,
    blocks: [],
  });
  assert.equal(getUnusedImageStats(onlySlotRef).totalCount, 1);
  assert.equal(getUnusedImageStats(onlySlotRef).unusedCount, 0);
});

test('외부 URL 이미지 Base64 변환 및 내부 이미지 풀 저장', async () => {
  // 1) blobToDataUrl 유틸 검증
  const dummyBlob = new Blob(['hello image'], { type: 'image/png' });
  const dataUrl = await blobToDataUrl(dummyBlob);
  assert.ok(dataUrl.startsWith('data:image/png;base64,'));

  // 2) collectExternalImageUrls: 외부 URL만 정확히 수집
  const sampleProj = parse(
    JSON.stringify({
      messages: [
        { speaker: 'A', text: '메시지 1', iconUrl: 'https://example.com/icon1.png' },
        { speaker: 'B', text: '메시지 2', iconUrl: 'https://example.com/icon2.png' },
        { speaker: 'C', text: '메시지 3', iconUrl: 'https://example.com/icon1.png' }, // 중복 URL
        { speaker: 'D', text: '메시지 4', iconUrl: 'data:image/png;base64,QUJD' }, // data URI는 제외
      ],
    }),
    'sample.json',
  );

  // 캐릭터 추가
  sampleProj.characters = [
    {
      id: 'char-1',
      name: '캐릭터 1',
      iconUrl: 'https://example.com/char.png',
      faces: [{ name: '기본', iconUrl: 'https://example.com/face.png' }],
    },
  ];

  // 퀵 슬롯 추가
  sampleProj.quickSlots = {
    '1': {
      speaker: '슬롯 화자',
      iconUrl: 'https://example.com/slot.png',
    },
  };

  const collected = collectExternalImageUrls(sampleProj);
  assert.equal(collected.size, 5);
  assert.ok(collected.has('https://example.com/icon1.png'));
  assert.ok(collected.has('https://example.com/icon2.png'));
  assert.ok(collected.has('https://example.com/char.png'));
  assert.ok(collected.has('https://example.com/face.png'));
  assert.ok(collected.has('https://example.com/slot.png'));
  assert.ok(!collected.has('data:image/png;base64,QUJD'));

  // 3) embedExternalImagesInProject: 매핑된 URL들을 Base64 풀로 변환하고 참조를 img:key로 교체
  const b64Map: Record<string, string> = {
    'https://example.com/icon1.png': 'data:image/png;base64,SU1BR0Ux',
    'https://example.com/char.png': 'data:image/png;base64,SU1BR0VDSEFS',
  };

  const embedded = embedExternalImagesInProject(sampleProj, b64Map);

  // icon1.png를 참조하던 블록 0과 2는 img:<hash>로 교체됨
  assert.ok(isImagePoolRef(embedded.blocks[0].iconUrl));
  assert.ok(isImagePoolRef(embedded.blocks[2].iconUrl));
  assert.equal(embedded.blocks[0].iconUrl, embedded.blocks[2].iconUrl);
  assert.equal(resolveImageUrl(embedded.blocks[0].iconUrl, embedded.images), 'data:image/png;base64,SU1BR0Ux');

  // 매핑되지 않은 icon2.png는 원본 그대로 유지
  assert.equal(embedded.blocks[1].iconUrl, 'https://example.com/icon2.png');

  // 캐릭터의 char.png도 img:<hash>로 교체됨
  assert.ok(isImagePoolRef(embedded.characters?.[0]?.iconUrl));
  assert.equal(resolveImageUrl(embedded.characters?.[0]?.iconUrl, embedded.images), 'data:image/png;base64,SU1BR0VDSEFS');

  // 풀에 등록된 이미지 수 확인
  assert.equal(Object.keys(embedded.images ?? {}).length, 3); // data URI(QUJD) 1개 + 새로 등록된 2개
});
