// ============================================================================
// 30_dims.js - shared dimensions (metres). Bike frame: origin on the ground
// midway under the machine, +X forward, +Y up, +Z the rider's right (the
// camera's usual side). World: the road runs along +X at z = 0.
// ============================================================================
const DIM = {
  R: SCORE.WHEEL_R, axleR: [-.86, SCORE.WHEEL_R, 0], axleF: [.92, SCORE.WHEEL_R, 0],
  bbF: [.30, .30, 0], bbR: [-.38, .30, 0], crank: .155, pedalZ: .15, ringR: .092, ringZ: .062,
  seatF: [.06, .86, 0], seatR: [-.60, .83, 0],                 // top of each saddle
  headTop: [.70, 1.00, 0], headBot: [.765, .76, 0],            // steering axis
  gripF: [.49, 1.075, .30], gripR: [-.28, .94, .265],          // right grips (mirror z for left)
  bell: [-.185, .965, .215],                                   // on the rear handlebar, right side
  basket: [1.00, .88, 0], basketH: [.165, .115, .185], lamp: [1.02, .64, 0],
  // the road
  home: -150, flatEnd: 160, cause0: 168, cause1: 296, causeH: .42, lightX: 308, lightZ: -15,
};
// road surface height at world x (smooth ramps on and off the causeway)
const groundY = x => DIM.causeH * smooth(DIM.flatEnd, DIM.cause0, x) * (1 - smooth(DIM.cause1, DIM.cause1 + 8, x));
