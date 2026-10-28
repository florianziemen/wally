// Exercise group chips, description and editor.

import { exerciseNames, groupNote, parseGroupInput, timingOf, timingText } from '../groups.js';
import { byId, el, twoTap } from './dom.js';

/** @param {import('../store.js').Store} store */
export function initGroupsView(store) {
  const chips = byId('g-chips');
  const desc = byId('g-desc');
  const editor = byId('g-editor');
  const nameInput = /** @type {HTMLInputElement} */ (byId('g-name'));
  const exInput = /** @type {HTMLTextAreaElement} */ (byId('g-ex'));
  const delBtn = /** @type {HTMLButtonElement} */ (byId('g-del'));
  const msg = byId('g-msg');
  const timingEl = byId('g-timing');

  /** @type {string|null} id of the group being edited, null for a new one */
  let editing = null;

  function closeEditor() {
    editor.hidden = true;
    editing = null;
  }

  const disarmDelete = twoTap(delBtn, 'Tap to delete', () => {
    if (editing) store.deleteGroup(editing);
    closeEditor();
  });

  /** @param {import('../groups.js').Group|null} group */
  function openEditor(group) {
    editing = group?.id ?? null;
    nameInput.value = group?.name ?? '';
    exInput.value = group?.exercises.join('\n') ?? '';
    delBtn.hidden = !group;
    disarmDelete();
    msg.textContent = '';
    editor.hidden = false;
    nameInput.focus();
  }

  byId('g-new').addEventListener('click', () => openEditor(null));
  byId('g-cancel').addEventListener('click', closeEditor);
  byId('g-save').addEventListener('click', () => {
    const input = parseGroupInput(nameInput.value, exInput.value);
    if ('error' in input) {
      msg.textContent = input.error;
      return;
    }
    const id = editing;
    closeEditor();
    store.saveGroup(id, input.name, input.exercises);
  });

  /**
   * @param {string} label
   * @param {string|null} id
   * @param {string|null} selected
   */
  function chip(label, id, selected) {
    const on = id === selected;
    const b = el('button', {
      className: on ? 'chip sel' : 'chip',
      text: label,
      attrs: { 'aria-pressed': String(on) },
    });
    b.addEventListener('click', () => store.selectGroup(id));
    return b;
  }

  function render() {
    const { groups, settings } = store.state;
    timingEl.textContent = `Saves the current timing: ${timingText(timingOf(settings))}.`;
    chips.replaceChildren(
      chip('No group', null, settings.group),
      ...groups.map((g) => chip(g.name, g.id, settings.group)),
    );

    const group = store.currentGroup();
    if (!group) {
      const verb = groups.length ? 'Pick' : 'Make';
      desc.replaceChildren(`${verb} a group to see each exercise’s name during work rounds.`);
      return;
    }
    const note = groupNote(group, settings.rounds, settings.sets);
    const edit = el('button', { className: 'linkbtn', text: 'Edit group' });
    edit.addEventListener('click', () => openEditor(group));
    desc.replaceChildren(el('span', { text: `${exerciseNames(group).join(', ')}. ${note} ` }), edit);
  }

  store.subscribe(render);
  render();
}
