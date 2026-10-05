// Sets zod's default messages to Dutch. Validation messages reach the user verbatim, so
// they have to be Dutch and not zod's default English texts.
import { z } from "zod";

z.config(z.locales.nl());
