// Everything a live versus match draws outside the Canvas: the rival link (status, results,
// rematch), the Zombie Mail HUD, the Director's war map and its between-turns cards. Game.jsx loads
// this chunk only once a room, a versus run or a Director match exists (see VersusMount there).
import VersusNet from './VersusNet'
import MailHud from './MailHud'
import DirectorView from './DirectorView'
import DirectorFlow from './DirectorFlow'

export default function VersusLayer() {
  return (
    <>
      <MailHud />
      <VersusNet />
      <DirectorView />
      <DirectorFlow />
    </>
  )
}
