import logger from "../../utils/logger";
import { PLATFORM } from "../../platform";
import { InputBackend } from "./InputBackend";
import { WindowsInputBackend } from "./WindowsInputBackend";
import { LinuxInputBackend } from "./LinuxInputBackend";
import { MacInputBackend } from "./MacInputBackend";

/** A backend that does nothing — used on unsupported platforms so the rest of
 *  the app runs (the lobby/cube still work; only phone OS-control is inert). */
class NullInputBackend implements InputBackend {
  enabled = false;
  warm() {}
  move() {}
  click() {}
  mouseDown() {}
  mouseUp() {}
  scroll() {}
  tapKey() {}
  type() {}
  combo() {}
  comboClick() {}
}

export function createInputBackend(): InputBackend {
  switch (PLATFORM) {
    case "win32":
      return new WindowsInputBackend();
    case "linux":
      return new LinuxInputBackend();
    case "darwin":
      return new MacInputBackend();
    default:
      logger.warn(`[inputControl] No input backend for platform '${process.platform}'.`);
      return new NullInputBackend();
  }
}

export type { InputBackend } from "./InputBackend";
