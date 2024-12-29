import { IDable } from "./typedefs";
/**
 * A classic Deque, implemented using a circular queue/array.
 * TODO: Delete is O(N), maybe use doubly linked list + inverted index to do everything in O(1)
 */
export class Deque<T extends IDable> {
    #capacity: number;
    #length: number = 0;
    #front: number = 0;
    #elements: T[];
    #index: Map<string, number> = new Map(); // again, inverted index

    constructor(capacity: number) {
        this.#capacity = capacity;
        this.#elements = new Array(capacity);
    }

    get size() {
        return this.#length;
    }

    get capacity() {
        return this.#capacity;
    }

    isEmpty() {
        return this.size == 0;
    }

    isFull() {
        return this.size == this.#capacity;
    }

    get #back() {
        return (this.#front + this.#length) % this.#capacity;
    }

    push(value: T) {
        if (this.isFull()) {
            throw new Error("Full deque.");
        }
        this.#elements[this.#back] = value;
        this.#index.set(value.id, this.#back);
        this.#length++;
    }

    pop() {
        if (this.isEmpty()) {
            throw new Error("Tried to pop from an empty deque.");
        }
        const item = this.#elements[this.#back];
        this.#elements[this.#back] = null;
        this.#index.delete(item.id);
        this.#length--;
        return item;
    }

    shift() {
        if (this.isEmpty()) {
            throw new Error("Tried to shift from an empty deque.");
        }
        const item = this.#elements[this.#front];
        this.#elements[this.#front] = null;
        this.#index.delete(item.id);
        this.#front = (this.#front + 1) % this.#capacity;
        this.#length--;
        return item;
    }

    unshift(value: T) {
        if (this.isFull()) {
            throw new Error("Full deque.");
        }
        this.#front = (this.#front - 1 + this.#capacity) % this.#capacity;
        this.#elements[this.#front] = value;
        this.#index.set(value.id, this.#front);
        this.#length++;
    }

    peekFront() {
        if (this.isEmpty()) {
            throw new Error("Tried to peek from an empty deque.");
        }
        return this.#elements[this.#front];
    }

    peekBack() {
        if (this.isEmpty()) {
            throw new Error("Tried to peek from an empty deque.");
        }
        return this.#elements[(this.#back - 1 + this.#capacity) % this.#capacity];
    }

    exists(id: string) {
        return this.#index.has(id);
    }

    get(id: string): T {
        const index = this.#index.get(id);
        if (index === undefined) {
            throw new Error(`ID ${id} not found in deque.`);
        }
        return this.#elements[index];
    }

    // This is O(N)!!!!
    delete(id: string): T {
        const index = this.#index.get(id);
        if (index === undefined) {
            throw new Error(`ID ${id} not found in deque.`);
        }

        const item = this.#elements[index];
        this.#elements[index] = null;

        if (index === this.#front) {
            this.#front = (this.#front + 1) % this.#capacity;
            return;
        }

        if (index === (this.#back - 1 + this.#capacity) % this.#capacity) {
            return this.pop();
        }

        // move all the things after the index one step forward
        for (let i = index, j = (i + 1) % this.#capacity; j != this.#back; i = j, j = (j + 1) % this.#capacity) {
            this.#elements[i] = this.#elements[j];
        }
        this.#elements[(this.#back - 1 + this.#capacity) % this.#capacity] = null;
        this.#length--;
        return item;
    }
}