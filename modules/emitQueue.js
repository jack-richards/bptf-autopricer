const EventEmitter = require('events');

class EmitQueue extends EventEmitter {
  constructor(socketIO, intervalMs = 20) {
    super();
    this.queue = [];
    this.socketIO = socketIO;
    this.intervalMs = intervalMs;
    this.running = false;
  }

  start() {
    if (this.running) {
      return;
    }
    this.running = true;
    this._process();
  }

  stop() {
    this.running = false;
  }

  enqueue(item) {
    this.queue.push(item);
  }

  _process() {
    if (!this.running) {
      return;
    }
    if (this.queue.length > 0) {
      const item = this.queue.shift();
      this.socketIO.emit('price', item);
      this.emit('emitted', item);
    }
    setTimeout(() => this._process(), this.intervalMs);
  }
}

module.exports = EmitQueue;
