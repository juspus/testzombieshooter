import { create } from 'zustand'
import { createWeaponsSlice } from './weaponsSlice'
import { createWaveSlice } from './waveSlice'
import { createEconomySlice } from './economySlice'
import { createUiSlice } from './uiSlice'
import { createMultiplayerSlice } from './multiplayerSlice'

export const useGameStore = create((set, get) => ({
  ...createWeaponsSlice(set, get),
  ...createWaveSlice(set, get),
  ...createEconomySlice(set, get),
  ...createUiSlice(set, get),
  ...createMultiplayerSlice(set, get),
}))

export * from './constants'
