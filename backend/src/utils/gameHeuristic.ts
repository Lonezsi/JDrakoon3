import fs from "fs";

// Heuristic: does this look like a game (vs. a regular mouse/keyboard app)?
//   1. clearly a utility/app → not a game (avoids false positives),
//   2. launcher path/name matches a known game store / engine / "games" dir,
//   3. "big app": a direct .exe launcher over ~80 MB is probably a game.
// Used to (a) surface games first in the Add System picker and (b) decide when
// to auto-enable gamepad mouse mode (non-games → likely need a cursor).
const GAME_HINTS =
  /steam|steamapps|epic ?games|epicgames|gog ?galaxy|gog\.com|riot ?games|riotgames|ubisoft|uplay|origin ?games|ea ?desktop|ea ?games|electronic arts|battle\.?net|blizzard|activision|rockstar|2k games|bethesda|xbox|game ?pass|unrealengine|unreal engine|unity|godot|minecraft|roblox|league of legends|valorant|[\\/]games?[\\/]/i;
const NON_GAME =
  /uninstall|setup|installer|update|readme|manual|support|website|documentation|microsoft office|word|excel|powerpoint|outlook|onenote|onedrive|teams|visual studio|vs ?code|notepad|calculator|chrome|firefox|edge|brave|opera|zoom|slack|discord|spotify|adobe|acrobat|photoshop|illustrator|7-?zip|winrar|obs studio|vlc/i;

export function isLikelyGame(name: string, launcher: string): boolean {
  if (NON_GAME.test(name)) return false;
  if (GAME_HINTS.test(launcher) || GAME_HINTS.test(name)) return true;
  try {
    if (
      /\.exe$/i.test(launcher) &&
      fs.statSync(launcher).size > 80 * 1024 * 1024
    )
      return true;
  } catch {
    /* not statable */
  }
  return false;
}
