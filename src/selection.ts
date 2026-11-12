export type SelectionAnchor = { id: string; selected: boolean } | null;
export type SelectionKeys = { ctrlKey: boolean; shiftKey: boolean };
export function selectMessage(
  current: Set<string>,
  anchor: SelectionAnchor,
  order: string[],
  id: string,
  keys: SelectionKeys,
) {
  const selected = new Set(current);
  let state = true;
  const start = anchor ? order.indexOf(anchor.id) : -1,
    end = order.indexOf(id);
  if (keys.shiftKey && anchor && start >= 0 && end >= 0) {
    state = anchor.selected;
    if (current.has(id) !== state) {
      for (const key of order.slice(Math.min(start, end), Math.max(start, end) + 1)) {
        if (state) selected.add(key);
        else selected.delete(key);
      }
    }
  } else if (keys.ctrlKey) {
    state = !selected.has(id);
    if (state) selected.add(id);
    else selected.delete(id);
  } else {
    selected.clear();
    selected.add(id);
  }
  return { selected, anchor: { id, selected: state } };
}
