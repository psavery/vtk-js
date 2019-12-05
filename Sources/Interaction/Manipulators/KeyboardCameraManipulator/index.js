import macro from 'vtk.js/Sources/macro';
import vtkCompositeKeyboardManipulator from 'vtk.js/Sources/Interaction/Manipulators/CompositeKeyboardManipulator';
import * as vtkMath from 'vtk.js/Sources/Common/Core/Math';

const { vtkErrorMacro } = macro;

const ANIMATION_REQUESTER = 'vtkKeyboardCameraManipulator';

// ----------------------------------------------------------------------------
// vtkKeyboardCameraManipulator methods
// ----------------------------------------------------------------------------

function vtkKeyboardCameraManipulator(publicAPI, model) {
  // Set our className
  model.classHierarchy.push('vtkKeyboardCameraManipulator');

  const internal = {
    activeRenderer: null,
    keysCurrentlyDown: [],
    currentDirection: [0, 0, 0],
    movementIntervalId: null,
  };

  //--------------------------------------------------------------------------

  publicAPI.inMotion = () => internal.movementIntervalId !== null;

  //--------------------------------------------------------------------------

  publicAPI.startMovement = () => {
    if (publicAPI.inMotion()) {
      vtkErrorMacro('Camera is already in motion!');
      return;
    }

    if (!internal.activeRenderer) {
      vtkErrorMacro('No active renderer!');
      return;
    }

    const move = () => {
      const renderer = internal.activeRenderer;
      if (internal.keysCurrentlyDown.length === 0 || !renderer) {
        publicAPI.endMovement();
        return;
      }

      publicAPI.moveCamera(
        renderer.getActiveCamera(),
        internal.currentDirection,
        model.movementSpeed
      );

      renderer.resetCameraClippingRange();

      const interactor = renderer.getRenderWindow().getInteractor();
      if (interactor.getLightFollowCamera()) {
        renderer.updateLightsGeometryToFollowCamera();
      }
    };

    publicAPI.calculateCurrentDirection();

    const renderer = internal.activeRenderer;
    const interactor = renderer.getRenderWindow().getInteractor();
    interactor.requestAnimation(ANIMATION_REQUESTER);
    internal.movementIntervalId = setInterval(move, 1);
  };

  //--------------------------------------------------------------------------

  publicAPI.endMovement = () => {
    clearInterval(internal.movementIntervalId);
    internal.movementIntervalId = null;

    const renderer = internal.activeRenderer;
    const interactor = renderer.getRenderWindow().getInteractor();
    interactor.cancelAnimation(ANIMATION_REQUESTER);
    internal.activeRenderer = null;
  };

  //--------------------------------------------------------------------------

  publicAPI.calculateCurrentDirection = () => {
    // Reset
    internal.currentDirection = [0, 0, 0];

    const renderer = internal.activeRenderer;
    if (!renderer) {
      return;
    }

    const camera = renderer.getActiveCamera();
    if (!camera) {
      return;
    }

    if (internal.keysCurrentlyDown.length === 0) {
      return;
    }

    let directions = internal.keysCurrentlyDown.map((key) =>
      publicAPI.getDirectionFromKey(key, camera)
    );
    directions = directions.filter((item) => item);

    if (directions.length === 0) {
      return;
    }

    const netDirection = directions.reduce((a, b) => {
      vtkMath.add(a, b, b);
      return b;
    });

    vtkMath.normalize(netDirection);

    internal.currentDirection = netDirection;
  };

  //--------------------------------------------------------------------------

  publicAPI.getDirectionFromKey = (key, camera) => {
    let direction;

    if (model.moveForwardKeys.includes(key)) {
      // Move forward
      direction = camera.getDirectionOfProjection();
    } else if (model.moveLeftKeys.includes(key)) {
      // Move left
      const dirProj = camera.getDirectionOfProjection();
      direction = [0, 0, 0];
      vtkMath.cross(camera.getViewUp(), dirProj, direction);
    } else if (model.moveBackwardKeys.includes(key)) {
      // Move backward
      direction = camera.getDirectionOfProjection().map((e) => -e);
    } else if (model.moveRightKeys.includes(key)) {
      // Move right
      const dirProj = camera.getDirectionOfProjection();
      direction = [0, 0, 0];
      vtkMath.cross(dirProj, camera.getViewUp(), direction);
    } else if (model.moveUpKeys.includes(key)) {
      // Move up
      direction = camera.getViewUp();
    } else if (model.moveDownKeys.includes(key)) {
      // Move down
      direction = camera.getViewUp().map((e) => -e);
    } else {
      return undefined;
    }

    vtkMath.normalize(direction);

    return direction;
  };

  //--------------------------------------------------------------------------

  publicAPI.moveCamera = (camera, direction, speed) => {
    const position = camera.getPosition();
    const focalPoint = camera.getFocalPoint();

    camera.setFocalPoint(
      focalPoint[0] + direction[0] * speed,
      focalPoint[1] + direction[1] * speed,
      focalPoint[2] + direction[2] * speed
    );

    camera.setPosition(
      position[0] + direction[0] * speed,
      position[1] + direction[1] * speed,
      position[2] + direction[2] * speed
    );
  };

  //--------------------------------------------------------------------------

  publicAPI.onKeyPress = (interactor, renderer, key) => {};

  //--------------------------------------------------------------------------

  publicAPI.onKeyDown = (interactor, renderer, key) => {
    if (!internal.keysCurrentlyDown.includes(key)) {
      internal.keysCurrentlyDown.push(key);
      publicAPI.calculateCurrentDirection();
    }

    if (!publicAPI.inMotion()) {
      internal.activeRenderer = renderer;
      publicAPI.startMovement();
    }
  };

  //--------------------------------------------------------------------------

  publicAPI.onKeyUp = (interactor, renderer, key) => {
    internal.keysCurrentlyDown = internal.keysCurrentlyDown.filter(
      (item) => item.toUpperCase() !== key.toUpperCase()
    );
    publicAPI.calculateCurrentDirection();
  };
}

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

const DEFAULT_VALUES = {
  movementSpeed: 0.01,
  // The following are case-insensitive
  moveForwardKeys: ['w', 'ArrowUp'],
  moveLeftKeys: ['a', 'ArrowLeft'],
  moveBackwardKeys: ['s', 'ArrowDown'],
  moveRightKeys: ['d', 'ArrowRight'],
  moveUpKeys: [' '],
  moveDownKeys: ['Shift'],
};

// ----------------------------------------------------------------------------

export function extend(publicAPI, model, initialValues = {}) {
  Object.assign(model, DEFAULT_VALUES, initialValues);

  // Inheritance
  macro.obj(publicAPI, model);
  vtkCompositeKeyboardManipulator.extend(publicAPI, model, initialValues);

  // Create get-set macros
  macro.setGet(publicAPI, model, [
    'movementSpeed',
    'moveForwardKeys',
    'moveLeftKeys',
    'moveBackwardKeys',
    'moveRightKeys',
    'moveUpKeys',
    'moveDownKeys',
  ]);

  // Object specific methods
  vtkKeyboardCameraManipulator(publicAPI, model);
}

// ----------------------------------------------------------------------------

export const newInstance = macro.newInstance(
  extend,
  'vtkKeyboardCameraManipulator'
);

// ----------------------------------------------------------------------------

export default { newInstance, extend };
