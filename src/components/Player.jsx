import { useFrame } from '@react-three/fiber'
import { consumeMobileLook, consumeMobilePressed } from '../mobileInput'
import { useGameStore } from '../store'
import usePlayerState from '../player/usePlayerState'
import usePlayerInput from '../player/usePlayerInput'
import usePlayerFiring from '../player/usePlayerFiring'
import usePlayerInteraction from '../player/usePlayerInteraction'
import usePlayerMovement from '../player/usePlayerMovement'

// The local player: pointer-lock camera, walking, shooting, the knife, the flamethrower, the shop chest,
// boarding, doors, the Mystery Box and bench, reviving. It is split by job into src/player/ (state, input,
// movement, interaction, firing); this component owns the one frame loop and calls their steps in order.
export default function Player() {
  const P = usePlayerState()
  const { phase, selfStatusRef, shopOpenRef, pausedRef } = P
  const input = usePlayerInput(P)
  const firing = usePlayerFiring(P, input.requestLock)
  const interaction = usePlayerInteraction(P)
  const movement = usePlayerMovement(P)

  useFrame((_, rawDelta) => {
    if (phase !== 'playing' && phase !== 'intermission') return
    const delta = Math.min(rawDelta, 0.05)   // a long frame (notification pull-down) must not teleport anything

    const mobilePressed = consumeMobilePressed()
    const mobileLook = consumeMobileLook()

    const gsC = useGameStore.getState()
    const inCoop = !!gsC.mpRole && gsC.mpConnected
    const myStatus = inCoop ? gsC.coop[gsC.mpRole].status : 'alive'
    selfStatusRef.current = myStatus
    const downed = myStatus !== 'alive'

    input.mobileButtons(mobilePressed, downed)

    if (shopOpenRef.current || pausedRef.current) return

    movement.look(mobileLook)
    firing.mobileFire(delta, mobilePressed)
    firing.tickTimers(delta)
    interaction.step(delta, gsC, inCoop, downed)
    firing.holdFire(delta)
    movement.aim()
    firing.flame(delta, myStatus)
    movement.move(delta, myStatus, downed)
  })

  return null
}
