/**
 * 轻量二叉最小堆优先队列，自己实现，不引第三方依赖。
 * 存 (priority, value) 对；priority 越小越先出队。
 */
export class MinHeap<T> {
  private readonly priorities: number[] = [];
  private readonly values: T[] = [];

  get size(): number {
    return this.values.length;
  }

  push(priority: number, value: T): void {
    this.priorities.push(priority);
    this.values.push(value);
    this.bubbleUp(this.values.length - 1);
  }

  pop(): { priority: number; value: T } | undefined {
    if (this.values.length === 0) return undefined;

    const top = { priority: this.priorities[0]!, value: this.values[0]! };
    const lastPriority = this.priorities.pop()!;
    const lastValue = this.values.pop()!;

    if (this.values.length > 0) {
      this.priorities[0] = lastPriority;
      this.values[0] = lastValue;
      this.sinkDown(0);
    }
    return top;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.priorities[parent]! <= this.priorities[index]!) break;
      this.swap(parent, index);
      index = parent;
    }
  }

  private sinkDown(index: number): void {
    const n = this.values.length;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;

      if (left < n && this.priorities[left]! < this.priorities[smallest]!) smallest = left;
      if (right < n && this.priorities[right]! < this.priorities[smallest]!) smallest = right;
      if (smallest === index) break;

      this.swap(smallest, index);
      index = smallest;
    }
  }

  private swap(a: number, b: number): void {
    const p = this.priorities[a]!;
    this.priorities[a] = this.priorities[b]!;
    this.priorities[b] = p;
    const v = this.values[a]!;
    this.values[a] = this.values[b]!;
    this.values[b] = v;
  }
}
