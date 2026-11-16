import { analyzeRequest, configFromEnv } from "../server/analyze.js";
export default {
  fetch(request) {
    return analyzeRequest(request, configFromEnv());
  },
};
