// 元に戻す / やり直す
export class History {
  constructor(limit = 60) {
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
    this.onChange = null;
  }
  push(action) {
    this.undoStack.push(action);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
    this.onChange && this.onChange();
  }
  undo() {
    const a = this.undoStack.pop();
    if (!a) return false;
    a.undo();
    this.redoStack.push(a);
    this.onChange && this.onChange();
    return true;
  }
  redo() {
    const a = this.redoStack.pop();
    if (!a) return false;
    a.redo();
    this.undoStack.push(a);
    this.onChange && this.onChange();
    return true;
  }
  clear() { this.undoStack.length = 0; this.redoStack.length = 0; this.onChange && this.onChange(); }
  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
}
