import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { showGroupCommands, switchModeCommand, MODE_GROUP } from '../groupManager';
import { SidebarMode } from '../types';

// A model of VS Code's editor-group behaviour, as observed in VS Code 1.141:
// - focusing group N activates it, creating it if missing;
// - focusing a group that isn't the maximized one un-maximizes;
// - toggleMaximizeEditorGroup maximizes the active group, or un-maximizes if it already is.
class Layout {
  groups = 1;
  active = 1;
  maximized: number | undefined;
  run(command: string) {
    const focus = /^workbench\.action\.focus(First|Second)EditorGroup$/.exec(command);
    if (focus) {
      const n = focus[1] === 'First' ? 1 : 2;
      this.groups = Math.max(this.groups, n);
      if (this.maximized !== undefined && this.maximized !== n) this.maximized = undefined;
      this.active = n;
    } else if (command === 'workbench.action.toggleMaximizeEditorGroup') {
      this.maximized = this.maximized === this.active ? undefined : this.active;
    }
  }
}

const starts = (): Layout[] => {
  const out: Layout[] = [];
  for (const groups of [1, 2]) for (const active of [1, 2]) for (const maximized of [undefined, 1, 2]) {
    if (active > groups || (maximized ?? 0) > groups) continue;
    out.push(Object.assign(new Layout(), { groups, active, maximized }));
  }
  return out;
};

describe('group mode switching', () => {
  for (const mode of ['explorer', 'scm'] as SidebarMode[]) {
    it(`leaves only the ${mode} group maximized, from every starting layout`, () => {
      for (const layout of starts()) {
        const before = JSON.stringify(layout);
        showGroupCommands(mode).forEach(c => layout.run(c));
        expect({ before, groups: layout.groups, active: layout.active, maximized: layout.maximized })
          .toEqual({ before, groups: 2, active: MODE_GROUP[mode], maximized: MODE_GROUP[mode] });
      }
    });
  }

  it('switch commands show the sidebar last, so focus ends there', () => {
    expect(switchModeCommand('scm').arguments![0].commands.at(-1)).toBe('workbench.view.scm');
    expect(switchModeCommand('explorer').arguments![0].commands.at(-1)).toBe('workbench.view.explorer');
  });

  it('package.json keybindings match the switch commands', () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8'));
    for (const [key, mode] of [['ctrl+shift+e', 'explorer'], ['ctrl+shift+g', 'scm']] as const) {
      const binding = pkg.contributes.keybindings.find((k: { key: string; command: string }) => k.key === key && k.command === 'runCommands');
      expect(binding.args).toEqual(switchModeCommand(mode).arguments![0]);
    }
  });
});
