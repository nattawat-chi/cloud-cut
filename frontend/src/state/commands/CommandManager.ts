/**
 * CommandManager — registry for undoable editor commands.
 *
 * Commands encapsulate a do/undo pair so that the history store can replay
 * or revert any mutation without knowing its implementation details.
 */

export interface Command {
  readonly name: string;
  execute(): void;
  undo(): void;
}

export class CommandManager {
  private readonly history: Command[] = [];
  private cursor = -1;

  execute(cmd: Command): void {
    // Truncate redo tail when a new command branches off
    this.history.splice(this.cursor + 1);
    cmd.execute();
    this.history.push(cmd);
    this.cursor = this.history.length - 1;
  }

  undo(): boolean {
    if (this.cursor < 0) return false;
    this.history[this.cursor]!.undo();
    this.cursor--;
    return true;
  }

  redo(): boolean {
    if (this.cursor >= this.history.length - 1) return false;
    this.cursor++;
    this.history[this.cursor]!.execute();
    return true;
  }

  canUndo(): boolean { return this.cursor >= 0; }
  canRedo(): boolean { return this.cursor < this.history.length - 1; }

  clear(): void {
    this.history.length = 0;
    this.cursor = -1;
  }
}

export const commandManager = new CommandManager();
