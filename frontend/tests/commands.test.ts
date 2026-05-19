import { describe, expect, it, vi } from 'vitest';

import { CommandManager } from '../src/state/commands/CommandManager';

function makeCmd(name: string) {
  const execute = vi.fn();
  const undo = vi.fn();
  return { name, execute, undo };
}

describe('CommandManager', () => {
  it('executes a command and tracks it', () => {
    const mgr = new CommandManager();
    const cmd = makeCmd('move');
    mgr.execute(cmd);
    expect(cmd.execute).toHaveBeenCalledOnce();
    expect(mgr.canUndo()).toBe(true);
  });

  it('undoes the last command', () => {
    const mgr = new CommandManager();
    const cmd = makeCmd('move');
    mgr.execute(cmd);
    mgr.undo();
    expect(cmd.undo).toHaveBeenCalledOnce();
    expect(mgr.canUndo()).toBe(false);
  });

  it('redoes after undo', () => {
    const mgr = new CommandManager();
    const cmd = makeCmd('move');
    mgr.execute(cmd);
    mgr.undo();
    mgr.redo();
    expect(cmd.execute).toHaveBeenCalledTimes(2);
  });

  it('truncates redo stack when new command is executed', () => {
    const mgr = new CommandManager();
    mgr.execute(makeCmd('a'));
    mgr.execute(makeCmd('b'));
    mgr.undo();
    mgr.execute(makeCmd('c'));
    expect(mgr.canRedo()).toBe(false);
  });
});
