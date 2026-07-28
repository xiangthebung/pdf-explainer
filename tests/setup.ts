/**
 * Test environment shims.
 *
 * pdf.js touches a few canvas globals at import time. jsdom does not provide
 * them, and the tests here only exercise the text layer, so minimal stand-ins
 * are enough to let the module load. Real browsers use the real implementations.
 */

interface Mutable {
  DOMMatrix?: unknown;
  Path2D?: unknown;
  ImageData?: unknown;
}

const globals = globalThis as Mutable;

if (typeof globals.DOMMatrix === 'undefined') {
  globals.DOMMatrix = class DOMMatrixStub {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;

    constructor(init?: number[] | string) {
      if (Array.isArray(init) && init.length >= 6) {
        [this.a, this.b, this.c, this.d, this.e, this.f] = init as [number, number, number, number, number, number];
      }
    }

    scaleSelf(): this {
      return this;
    }
    scale(): this {
      return this;
    }
    translate(): this {
      return this;
    }
    multiply(): this {
      return this;
    }
    inverse(): this {
      return this;
    }
    transformPoint<T>(point: T): T {
      return point;
    }
    toString(): string {
      return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})`;
    }
  };
}

if (typeof globals.Path2D === 'undefined') {
  globals.Path2D = class Path2DStub {
    addPath(): void {}
    closePath(): void {}
    moveTo(): void {}
    lineTo(): void {}
    bezierCurveTo(): void {}
    quadraticCurveTo(): void {}
    arc(): void {}
    rect(): void {}
  };
}
