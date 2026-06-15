export const createUiSlice = (set, get) => ({
  shopOpen: false,
  nearChest: false,
  nearWindowId: -1,  // window the player is currently standing near (-1 = none)
  boardingProgress: 0,  // 0–1, fraction of 2s hold complete
  skipProgress: 0,      // 0–1, fraction of hold-T skip complete
  paused: false,

  openShop: () => set({ shopOpen: true }),
  closeShop: () => set({ shopOpen: false }),

  setNearWindowId: (id) => set({ nearWindowId: id }),
  setBoardingProgress: (v) => set({ boardingProgress: v }),
  setSkipProgress: (v) => set({ skipProgress: v }),
  setNearChest: (v) => set({ nearChest: v }),
})
