import registerWebworker from 'webworker-promise/lib/register';

import { SlicingMode } from 'vtk.js/Sources/Rendering/Core/ImageMapper/Constants';
import { vec3 } from 'gl-matrix';

const globals = {
  // single-component labelmap
  buffer: null,
  dimensions: [0, 0, 0],
  prevPoint: null,
  slicingMode: null,
};

// --------------------------------------------------------------------------

function handlePaintRectangle({ point1, point2 }) {
  const [x1, y1, z1] = point1;
  const [x2, y2, z2] = point2;

  const xstart = Math.max(Math.min(x1, x2), 0);
  const xend = Math.min(Math.max(x1, x2), globals.dimensions[0] - 1);
  if (xstart <= xend) {
    const ystart = Math.max(Math.min(y1, y2), 0);
    const yend = Math.min(Math.max(y1, y2), globals.dimensions[1] - 1);
    const zstart = Math.max(Math.min(z1, z2), 0);
    const zend = Math.min(Math.max(z1, z2), globals.dimensions[2] - 1);

    const jStride = globals.dimensions[0];
    const kStride = globals.dimensions[0] * globals.dimensions[1];

    for (let k = zstart; k <= zend; k++) {
      for (let j = ystart; j <= yend; j++) {
        const index = j * jStride + k * kStride;
        globals.buffer.fill(1, index + xstart, index + xend + 1);
      }
    }
  }
}

// --------------------------------------------------------------------------

function handlePaintEllipse({ center, scale3 }) {
  const yStride = globals.dimensions[0];
  const zStride = globals.dimensions[0] * globals.dimensions[1];

  const zmin = Math.round(Math.max(center[2] - scale3[2], 0));
  const zmax = Math.round(
    Math.min(center[2] + scale3[2], globals.dimensions[2] - 1)
  );

  for (let z = zmin; z <= zmax; z++) {
    const dz = (center[2] - z) / scale3[2];
    const ay = scale3[1] * Math.sqrt(1 - dz * dz);

    const ymin = Math.round(Math.max(center[1] - ay, 0));
    const ymax = Math.round(
      Math.min(center[1] + ay, globals.dimensions[1] - 1)
    );

    for (let y = ymin; y <= ymax; y++) {
      const dy = (center[1] - y) / scale3[1];
      const ax = scale3[0] * Math.sqrt(1 - dy * dy - dz * dz);

      const xmin = Math.round(Math.max(center[0] - ax, 0));
      const xmax = Math.round(
        Math.min(center[0] + ax, globals.dimensions[0] - 1)
      );
      if (xmin <= xmax) {
        const index = y * yStride + z * zStride;
        globals.buffer.fill(1, index + xmin, index + xmax + 1);
      }
    }
  }
}

// --------------------------------------------------------------------------

function handlePaint({ point, radius }) {
  if (!globals.prevPoint) {
    globals.prevPoint = point;
  }

  if (
    globals.slicingMode === SlicingMode.X ||
    globals.slicingMode === SlicingMode.I
  ) {
    radius[0] = 0.25;
  } else if (
    globals.slicingMode === SlicingMode.Y ||
    globals.slicingMode === SlicingMode.J
  ) {
    radius[1] = 0.25;
  } else if (
    globals.slicingMode === SlicingMode.Z ||
    globals.slicingMode === SlicingMode.K
  ) {
    radius[2] = 0.25;
  }

  // DDA params
  const delta = [
    point[0] - globals.prevPoint[0],
    point[1] - globals.prevPoint[1],
    point[2] - globals.prevPoint[2],
  ];
  const inc = [1, 1, 1];
  for (let i = 0; i < 3; i++) {
    if (delta[i] < 0) {
      delta[i] = -delta[i];
      inc[i] = -1;
    }
  }
  const step = Math.max(...delta);

  // DDA
  const thresh = [step, step, step];
  const pt = [...globals.prevPoint];
  for (let s = 0; s <= step; s++) {
    handlePaintEllipse({ center: pt, scale3: radius });

    for (let ii = 0; ii < 3; ii++) {
      thresh[ii] -= delta[ii];
      if (thresh[ii] <= 0) {
        thresh[ii] += step;
        pt[ii] += inc[ii];
      }
    }
  }

  globals.prevPoint = point;
}

// --------------------------------------------------------------------------

function handlePaintTriangles({ triangleList }) {
  // debugger;

  const triangleCount = Math.floor(triangleList.length / 9);

  for (let i = 0; i < triangleCount; i++) {
    const point0 = triangleList.subarray(9 * i + 0, 9 * i + 3);
    const point1 = triangleList.subarray(9 * i + 3, 9 * i + 6);
    const point2 = triangleList.subarray(9 * i + 6, 9 * i + 9);

    const v1 = [0, 0, 0];
    const v2 = [0, 0, 0];

    vec3.subtract(v1, point1, point0);
    vec3.subtract(v2, point2, point0);

    const step1 = [0, 0, 0];
    const numStep1 =
      2 * Math.max(Math.abs(v1[0]), Math.abs(v1[1]), Math.abs(v1[2]));
    vec3.scale(step1, v1, 1 / numStep1);

    const step2 = [0, 0, 0];
    const numStep2 =
      2 * Math.max(Math.abs(v2[0]), Math.abs(v2[1]), Math.abs(v2[2]));
    vec3.scale(step2, v2, 1 / numStep2);

    const jStride = globals.dimensions[0];
    const kStride = globals.dimensions[0] * globals.dimensions[1];

    for (let u = 0; u <= numStep1 + 1; u++) {
      const maxV = numStep2 - u * (numStep2 / numStep1);
      for (let v = 0; v <= maxV + 1; v++) {
        const point = [...point0];
        vec3.scaleAndAdd(point, point, step1, u);
        vec3.scaleAndAdd(point, point, step2, v);

        point[0] = Math.floor(point[0]);
        point[1] = Math.floor(point[1]);
        point[2] = Math.floor(point[2]);

        if (
          point[0] >= 0 &&
          point[0] < globals.dimensions[0] &&
          point[1] >= 0 &&
          point[1] < globals.dimensions[1] &&
          point[2] >= 0 &&
          point[2] < globals.dimensions[2]
        ) {
          globals.buffer[
            point[0] + jStride * point[1] + kStride * point[2]
          ] = 1;
        }
      }
    }
  }
}

// --------------------------------------------------------------------------

registerWebworker()
  .operation('start', ({ bufferType, dimensions, slicingMode }) => {
    if (!globals.buffer) {
      const bufferSize = dimensions[0] * dimensions[1] * dimensions[2];
      /* eslint-disable-next-line */
      globals.buffer = new self[bufferType](bufferSize);
      globals.dimensions = dimensions;
      globals.prevPoint = null;
      globals.slicingMode = slicingMode;
    }
  })
  .operation('paint', handlePaint)
  .operation('paintRectangle', handlePaintRectangle)
  .operation('paintEllipse', handlePaintEllipse)
  .operation('paintTriangles', handlePaintTriangles)
  .operation('end', () => {
    const response = new registerWebworker.TransferableResponse(
      globals.buffer.buffer,
      [globals.buffer.buffer]
    );
    globals.buffer = null;
    return response;
  });
