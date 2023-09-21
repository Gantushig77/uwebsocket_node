import uws, {
  HttpRequest,
  HttpResponse,
  SHARED_COMPRESSOR,
  TemplatedApp,
  WebSocket,
  us_socket_context_t,
} from "../uWebSockets.js-20.31.0";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";

const app: TemplatedApp = uws.App();
const port = 9001;
const jwtSecretKey = "jwtSecret";

app
  .ws("/*", {
    /* There are many common helper features */
    idleTimeout: 32,
    maxBackpressure: 1024,
    compression: SHARED_COMPRESSOR,
    maxPayloadLength: 16 * 1024 * 1024,

    upgrade: (
      res: HttpResponse,
      req: HttpRequest,
      context: us_socket_context_t
    ): void | Promise<void> => {
      console.log(
        "An Http connection wants to become WebSocket, URL: ",
        req.getUrl()
      );
      try {
        console.log("test : ", req.getHeader("authorization"));
        const decoded = decodeJwt(res, req, "authorization");
        console.log("decoded :", decoded);
        res.user = decoded;

        res.upgrade(
          decoded,
          req.getHeader("sec-websocket-key"),
          req.getHeader("sec-websocket-protocol"),
          req.getHeader("sec-websocket-extensions"),
          context
        );
        return;
      } catch (e) {
        console.log(e);
        res.writeStatus("401").end();
        return;
      }
    },

    open: (ws) => {
      console.log("A user is connected to WS.");
      console.log(ws.getUserData());
    },

    /* For brevity we skip the other events (upgrade, open, ping, pong, close) */
    message: (
      ws: WebSocket<Record<string, any>>,
      message: ArrayBuffer,
      isBinary: boolean
    ) => {
      /* You can do app.publish('sensors/home/temperature', '22C') kind of pub/sub as well */
      console.log(
        "receiving message : ",
        Buffer.from(message).toString("utf-8")
      );
      /* Here we echo the message back, using compression if available */
      let ok = ws.send(JSON.stringify({ hello: "Im fine" }), isBinary, true);
      console.log(ok);
    },
  })
  .get("/*", (res: HttpResponse, req: HttpRequest) => {
    /* It does Http as well */
    res
      .writeStatus("200 OK")
      .writeHeader("IsExample", "Yes")
      .end("Hello there!");
  })
  .post("/login", (res: HttpResponse, req: HttpRequest) => {
    /* Note that you cannot read from req after returning from here */
    let url = req.getUrl();

    /* Read the body until done or error */
    readJson(res, onSuccess, onError);

    function onSuccess(obj: JSON) {
      console.log("Posted to " + url + ": ");
      let resBody = { ...obj, id: uuidv4() };
      console.log(resBody);

      res.end(JSON.stringify({ token: jwt.sign(resBody, jwtSecretKey) }));
    }

    function onError() {
      console.log("Ugh!");
    }
  })
  .listen(port, (token) => {
    if (token) {
      console.log("Listening to port " + port);
    } else {
      console.log("Failed to listen to port " + port);
    }
  });

function decodeJwt(
  res: HttpResponse,
  req: HttpRequest,
  name: string
): string | JwtPayload {
  return jwt.verify(req.getHeader(name), jwtSecretKey);
}

/* Helper function for reading a posted JSON body */
function readJson(res: HttpResponse, cb: (json: JSON) => void, err: any) {
  let buffer: Buffer;
  /* Register data cb */
  res.onData((ab, isLast) => {
    let chunk = Buffer.from(ab);
    if (isLast) {
      if (buffer) {
        cb(JSON.parse(Buffer.concat([buffer, chunk]).toString("utf-8")));
      } else {
        cb(JSON.parse(chunk.toString("utf-8")));
      }
    } else {
      if (buffer) {
        buffer = Buffer.concat([buffer, chunk]);
      } else {
        buffer = Buffer.concat([chunk]);
      }
    }
  });

  /* Register error cb */
  res.onAborted(err);
}
