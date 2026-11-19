// Unit tests for the composer's per-session drafts (public/js/composer-drafts.js), with a fake text box and attachment list.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../public/js/composer-drafts.js');

/** A fake composer box: a textarea-like object and an attachment list. Switch counts onSwitch calls. */
function box() {
  const state = { textarea: { value: '' }, list: [], switched: 0 };
  state.files = { get: () => state.list, set: list => { state.list = list; } };
  state.onSwitch = () => { state.switched++; };
  return state;
}
const slot = async fake => (await load()).createDraftSlot({ textarea: fake.textarea, files: fake.files, onSwitch: fake.onSwitch });

describe('composer drafts', () => {
  test('a draft stays with its session when the box switches to another and back', async () => {
    const fake = box();
    const drafts = await slot(fake);
    drafts.bind('s1');
    fake.textarea.value = 'hello'; fake.list = [{ name: 'a.png' }]; drafts.save();
    drafts.bind('s2');
    assert.equal(fake.textarea.value, '');
    assert.deepEqual(fake.list, []);
    fake.textarea.value = 'other'; drafts.save();
    drafts.bind('s1');
    assert.equal(fake.textarea.value, 'hello');
    assert.deepEqual(fake.list, [{ name: 'a.png' }]);
    drafts.bind('s2');
    assert.equal(fake.textarea.value, 'other');
  });

  test('two composers share one store: a session shows its draft in whichever pane opens it', async () => {
    const first = box(); const second = box();
    const a = await slot(first); const b = await slot(second);
    a.bind('shared');
    first.textarea.value = 'typed in the main pane'; a.save();
    b.bind('shared');
    assert.equal(second.textarea.value, 'typed in the main pane');
  });

  test('an emptied box forgets its draft; binding the same key again changes nothing', async () => {
    const fake = box();
    const drafts = await slot(fake);
    drafts.bind('s3');
    fake.textarea.value = 'x'; drafts.save();
    fake.textarea.value = ''; drafts.save();
    const before = fake.switched;
    drafts.bind('s3');
    assert.equal(fake.switched, before);
    drafts.bind('s4'); drafts.bind('s3');
    assert.equal(fake.textarea.value, '');
  });

  test('a null key (a pane with no session) shows an empty box and stores nothing', async () => {
    const fake = box();
    const drafts = await slot(fake);
    drafts.bind('s5');
    fake.textarea.value = 'keep'; drafts.save();
    drafts.bind(null);
    assert.equal(fake.textarea.value, '');
    fake.textarea.value = 'stray'; drafts.save();
    drafts.bind('s5');
    assert.equal(fake.textarea.value, 'keep');
  });

  test('onSwitch runs when the draft changes, and a save during loading is ignored', async () => {
    const fake = box();
    const drafts = await slot(fake);
    fake.files.set = list => { fake.list = list; drafts.save(); }; // a change handler firing while the draft loads
    drafts.bind('s6');
    fake.textarea.value = 'six'; drafts.save();
    drafts.bind('s7');
    drafts.bind('s6');
    assert.equal(fake.textarea.value, 'six');
    assert.equal(fake.switched, 3);
  });
});
