import colada from "pino-colada";
import pino from "pino";

export default pino({
  prettyPrint: {
    levelFirst: true
  },
  prettifier: colada
});
