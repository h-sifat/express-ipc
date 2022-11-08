# Express-IPC

![Module Type](https://img.shields.io/badge/Module%20Type-UMD-brightgreen)
![Npm Version](https://img.shields.io/npm/v/express-ipc)
![GitHub Tag](https://img.shields.io/github/v/tag/h-sifat/express-ipc)
![GitHub Issues](https://img.shields.io/github/issues/h-sifat/express-ipc)

A simple [IPC (Inter Process
Communication)](https://en.wikipedia.org/wiki/Inter-process_communication)
server with [Express](https://www.npmjs.com/package/express)-like request and
route handling that also supports broadcasting to multiple channels. It also
provides an easy to use axios like client to communicate with the server.

It usages **unix domain socket** on Unix OS and **windows named pipe** on
Windows OS. Which results in very fast communication speed (e.g., `< 5ms`
latency for a `300Kb` payload). Though it runs on the TCP protocol, it's request
and response objects are designed like the HTTP's, meaning a request has
properties like `method`, `headers`, `query`, `body` and so on. It is
specifically designed to perform
[CRUD](https://en.wikipedia.org/wiki/Create,_read,_update_and_delete) operations
with plain **JSON** objects (request and response) and where the server has the
ability to broadcast arbitrary JSON data to multiple channels (which clients
must subscribe to, to receive the data).

### Quick Links

1. [Installing](#installation)
1. [Importing](#importing)
1. [API Documentation](#api-documentation)
1. [Todo](#todo)
1. [Development](#development)

## Example Usages

#### Request and Response

**server.js**

```js
const { Server } = require("express-ipc");

const socketPath = "./pipe";
const server = new Server();

const users = [
  { id: 1, name: "Alex" },
  { id: 2, name: "Alexa" },
];

server.get("/users/:id", ({ req, res }) => {
  const id = Number(req.params.id);
  const user = users.find((user) => user.id === id);

  if (user) res.send(user);
  else res.send({ message: `No user found with id: ${id}` }, { isError: true });
});

server.listen({
  path: socketPath,
  deleteSocketBeforeListening: true,
  callback() {
    console.log(`Server running on socket: ${server.socketPath}`);
  },
});
```

**client.js**

```js
const { Client } = require("express-ipc");
const socketPath = "./pipe";

main();

async function main() {
  const client = new Client({ path: socketPath });

  try {
    const response = await client.get("/users/1");
    console.log(response);
  } catch (ex) {
    console.log(ex);
  }

  client.close();
}
```

#### Data Broadcasting

**server.js**

```js
const { Server } = require("express-ipc");

const socketPath = "./pipe";
const server = new Server();

server.createChannels("test");

let count = 1;
setInterval(() => {
  server.broadcast({ channel: "test", data: { count: count++ } });
}, 1000);

server.listen({ path: socketPath, deleteSocketBeforeListening: true });
```

**client.js**

```js
const { Client } = require("express-ipc");
const socketPath = "./pipe";

main();

async function main() {
  const client = new Client({ path: socketPath });

  await client.subscribe("test");

  client.on("broadcast", console.log);
}
```

## Installation

```bash
npm install express-ipc
```

## Importing

It uses the **UMD** module system so it supports all JavaScript module systems
(es6, commonjs, and so on).

**commonjs**

```js
const { Server, Client } = require("express-ipc");
```

**es6**

```js
import { Server, Client } from "express-ipc";
```

### Partial Importing

In case you only want to import the `Server` or the `Client` and don't want to
carry extra baggage in your application. If you're using a module bundler, it's
probably not necessary as unused code gets tree-shaken.

**server**

```js
// es6
import { default as expressIpc } from "express-ipc/dist/server.js";
const Server = expressIpc.Server;

// or commonjs:
const { Server } = require("express-ipc/dist/server");
```

**client**

```js
import { default as expressIpc } from "express-ipc/dist/client.js";
const Client = expressIpc.Client;

// or commonjs
const { Client } = require("express-ipc/dist/client");
```

## API Documentation

Before we start, it is assumed that you are familiar with
[Express.js](https://www.npmjs.com/package/express) because the route handling
and path pattern work exactly like Express with very little difference. So, I
would highly recommend you to read the
[documentation](https://expressjs.com/en/starter/installing.html) of Express
first.

#### Table Of Contents

1. [Server](#server)

   1. [`Constructor: Server()`](#constructor-server)
   1. [`server.socketPath`](#serversocketpath)
   1. [`server.listen()`](#serverlisten)
   1. [`server.close()`](#serverclose)
   1. [`server.createChannels()`](#servercreatechannels)
   1. [`server.deleteChannels()`](#serverdeletechannels)
   1. [`server.broadcast()`](#serverbroadcast)
   1. [`server.on()`](#serveron)

1. [Routing](#routing)

   1. [Method](#method)
   1. [Path](#path)
   1. [Handler/Middleware](#handler--middleware)
   1. [Request Object (`req`)](#request-object-req)
   1. [Response Object (`res`)](#response-object-res)
   1. [Next Function (`next`)](#the-next-function)
   1. [Error Handling](#error-handling)

1. [Client](#client)

   1. [`Constructor: Client()`](#constructor-client)
   1. [`client.subscribe()`](#clientsubscribe)
   1. [`client.unsubscribe()`](#clientunsubscribe)
   1. [`client.request()`](#clientrequest)
   1. [`client.get()`](#clientget)
   1. [`client.delete()`](#clientdelete)
   1. [`client.post()`](#clientpost)
   1. [`client.patch()`](#clientpatch)
   1. [`client.on()`](#clienton)
      1. [Receiving Broadcasts](#receiving-broadcasts)
      1. [Handling Client Errors](#handling-errors)
   1. [`client.close()`](#clientclose)

### Server

Go to [Table Of Contents](#table-of-contents)

#### Constructor: `Server()`

The `Server` class constructor takes an **optional** object argument with two
optional properties. It has the following interface:

```ts
interface ServerConstructor_Argument {
  delimiter?: string;
  socketRoot?: string;
}
```

| property   | default value | description                                                                                                                                  |
| ---------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| delimiter  | `"\f"`        | This character is used to indicate the end a of serialized request or response data in the socket.                                           |
| socketRoot | `os.tmpdir()` | If no absolute `path` is provided for the socket in the `server.listen` method's argument then the socket will be created in this directory. |

**Example:**

```js
const server = new Server({ delimiter: "\n", socketRoot: "./sockets" });
```

#### `server.socketPath`

A **getter** which returns the active `socket` path (a string). If the server is
not running it returns `undefined`.

Go to [Table Of Contents](#table-of-contents)

#### `server.listen()`

Listens on the given socket path for requests. It takes a single object argument
that has the following interface:

```ts
interface Listen_Argument {
  callback?: () => void;
  deleteSocketBeforeListening?: boolean;
  path: string | { namespace: string; id: string };
}
```

| property                      | description                                                                                                                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `path`                        | If path is a `string` than it should refer to a socket's absolute path. Otherwise, if it is an object of type `{namespace: string; id: string}` then the socketPath will be constructed from: `path.join(socketRoot, namespace + "_" + id)` |
| `deleteSocketBeforeListening` | If the socket file already exists and we try to listen on it, an exception with the code `"EADDRINUSE"` will be thrown. To avoid this we can set this flag to `true`.                                                                       |
| `callback`                    | If provided then it'll be called when the server starts listening.                                                                                                                                                                          |

**Example:**

```js
server.listen({
  deleteSocketBeforeListening: true,
  path: { namespace: "test_app", id: "v1" },
  callback() {
    console.log("Server running on socket: ", server.socketPath);
  },
});
```

Go to [Table Of Contents](#table-of-contents)

#### `server.close()`

Closes a server. It takes an optional callback function.

Go to [Table Of Contents](#table-of-contents)

#### `server.createChannels()`

Creates broadcast channels. It takes a **rest** argument or `string` or an
**array** of `string`s.

**Example:**

```js
server.createChannels("a", "b", ["c", "d"], "e");
```

Go to [Table Of Contents](#table-of-contents)

#### `server.deleteChannels()`

Deletes broadcast channels. It's signature is the same as
`server.createChannels`.

**Example:**

```js
server.deleteChannels(["a", "b", "e"], "c", "d");
```

Go to [Table Of Contents](#table-of-contents)

#### `server.broadcast()`

Broadcasts data to a channel. It takes a single object argument with the
following interface:

```ts
interface Broadcast_Argument {
  data: object;
  channel: string;
  blacklist?: number[];
}
```

| property  | description                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------ |
| data      | The data to broadcast.                                                                           |
| channel   | The channel name.                                                                                |
| blacklist | An array of `connectionId`s. This can used to stop some connection from receiving the broadcast. |

**Tip:** We can get the `connectionId` from a response object.

**Example:**

```js
server.post("/exciting-news", ({ req, res }) => {
  // as this connection itself brought the news,
  // we don't need to echo the news back to it.
  // I know it's not a good example but it shows the functionality

  server.broadcast({
    data: req.body,
    channel: "exciting-news",
    blacklist: [res.connectionId],
  });
});
```

Go to [Table Of Contents](#table-of-contents)

#### `server.on()`

With this method we can add event listeners on the underlying socket server
created with the `net.createServer` function.

**Example:**

```js
server.on("error", (err) => {});
```

Go to [Table Of Contents](#table-of-contents)

### Routing

Routing works similar to Express.js. It takes the following structure:

```js
server.method(path, handler | middleware);

// example
server.get("/users/:id", ({ req, res, next }) => {});
```

Go to [Table Of Contents](#table-of-contents)

#### Method

Request methods. express-ipc only supports these four methods:

1. `get`
1. `post`
1. `patch`
1. `delete`

Additionally We can use `all` and `use` to define routes on paths that runs for
any request method. Though `all` and `use` methods are similar but we can use
the `use` method to define **application level** ( runs regardless of the
request path)
[middlewares](https://expressjs.com/en/guide/writing-middleware.html).

**Example: Application level middleware**

```js
server.use(({ req, res, next }) => {
  // ... do something with the request object

  next(); // pass the request to the next middleware
});
```

Go to [Table Of Contents](#table-of-contents)

#### Path

The route path works exactly like express because it uses the same
[path-to-regexp](https://www.npmjs.com/package/path-to-regexp) package to parse
route paths, that express uses. See the express documentation for [Route
Path](https://expressjs.com/en/guide/routing.html).

Go to [Table Of Contents](#table-of-contents)

#### Handler / Middleware

The handler/middleware functions' signature is a little different from express.
In Express, a middleware function has the following signature:

```js
function (req, res, next) {}
```

It takes three arguments. In contrast, express-ipc packs these three arguments
into an object.

```js
function (arg) {arg.req; arg.res; arg.next}

// or better, if we destructure them
function ({req, res, next}) {}

// we can only the pick  properties that we are interested in
function ({req, next}) {}
```

Go to [Table Of Contents](#table-of-contents)

##### Error Handler / Middleware

In Express, an error handler takes four arguments:

```js
function (err, req, res, next) {}
```

On the other hand, express-ipc takes two arguments:

```js
function (reqResNextObject, err) {}

// only picking the required properties
function ({res}, err) {}
```

Handlers / Middlewares can be defined in various ways. Suppose that, we have two
handlers named `handler_a`, `handler_b` and an error handler named
`error_handler`. Then all the following examples are equivalent.

**Example: 1**

```js
server.post("/users", handler_a, handler_b, error_handler);
// or
server.post("/users", [handler_a, error_handler, handler_b]);
// or
server.post("/users", handler_a, [handler_b, error_handler]);
// or
server.post("/users", [handler_a, handler_b], error_handler);
// or
server.post("/users", handler_a, error_handler, [handler_b]);
```

**Example: 2**

```js
server.post("/users", handler_a, handler_b);
server.post("/users", error_handler);
```

**Example: 3**

```js
server.post("/users", error_handler);
server.post("/users", handler_a, handler_b);
```

**Note:** Error handlers are stored in different stacks than general request
handlers or middlewares. So, it's ok if we mix them up.

Go to [Table Of Contents](#table-of-contents)

#### Request Object (`req`)

The request object or the `req` property in a handler's / middleware's first
argument has the following interface.

```ts
interface Request {
  path: string;
  params: object;
  readonly url: string;
  readonly query: object;
  readonly headers: object;
  readonly body: object | null;
  readonly method: "get" | "post" | "delete" | "patch";
}
```

All the properties are **readonly** except **path** and **params**. Meaning we
cannot reassign the readonly properties with new values. But, if the property is
an object, we can modify it.

**Example:**

```js
server.get("/users/:id", ({ req }) => {
  // reassigning: forbidden
  req.body = null; // will throw an error in strict mode

  // modifying: allowed
  req.body.test = "new property";
});
```

Go to [Table Of Contents](#table-of-contents)

#### Response Object (`res`)

The response object (`res` from a handler's / middleware's first argument) has
the following interface:

```ts
interface Response {
  get isSent(): boolean;
  get headers(): object;
  get connectionId(): number;
  send(
    body?: object | null,
    options?: { endConnection?: boolean; isError?: boolean }
  ): void;
}
```

| property       | description                                                                                                                                                                                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `isSent`       | a getter; returns a boolean value indicating whether the `send` method has already been called.                                                                                                                                                                                                  |
| `headers`      | a getter; returns the headers object of the response. Its properties are modifiable.                                                                                                                                                                                                             |
| `connectionId` | a getter; returns the `connectionId` of the underlying socket. Can be used to blacklist a connection when broadcasting data                                                                                                                                                                      |
| `send`         | A method to send the response. It takes two optional arguments: first `body` and second `options`. If no argument is provided then the response body will be null. We can use the `isError` flag to mark the response as an error response and the `endConnection` to end the underlying socket. |

**Example**

```js
server.get("/users/:id", ({ req, res }) => {
  const id = Number(req.params.id);

  if (Number.isNaN(id)) {
    res.headers.statusCode = 400;
    return res.send({ message: "Invalid id" }, { isError: true });
  }

  const user = /* get the user somehow */;

  // res.isSent: false
  res.send(user);
  // res.isSent: true
});
```

Go to [Table Of Contents](#table-of-contents)

#### The `next` function

The `next` function from a handler's / middleware's first argument can be used
to pass control to the next middleware or error handler.

**Example:**

```js
server.get(
  "/users",
  ({ next }) => {
    next(); // pass control to the next handler
  },
  ({ res }) => {
    res.send(/* users */);
  }
);
```

```js
server.get(
  "/users",
  ({ next }) => {
    // pass control to the next error handler
    next(new Error("failed"));
  },
  ({ res }, error) => {
    res.send(/* error response */, {isError: true});
  }
);
```

Go to [Table Of Contents](#table-of-contents)

#### Error Handling

If a handler / middleware throws an exception or rejects a promise it'll be
automatically caught and passed to the next error handler or the default error
handler (if no error handler is defined). But in any other cases, we've to pass
an error manually to the `next` function to move to the error handlers.

**Example:**

Suppose that, we have a `getUsers` function that takes a callback function. In
this case we can handle the error as shown in the following snippet.

```js
server.get("/users", ({ next, res }) => {
  getUsers((error, users) => {
    if (error) next(error);
    else res.send(users);
  });
});

server.get("/users", ({ res }, error) => {
  // do something with the error
});
```

Go to [Table Of Contents](#table-of-contents)

### Client

Before we start, we need to know the request and response object's shape.

Go to [Table Of Contents](#table-of-contents)

##### RequestPayload

```ts
interface RequestPayload {
  url: string;
  query: object;
  headers: object;
  body: object | null;
  method: "get" | "post" | "delete" | "patch";
}
```

Go to [Table Of Contents](#table-of-contents)

##### ResponsePayload

```ts
interface ResponsePayload {
  headers: object;
  body: object | null;
}
```

Go to [Table Of Contents](#table-of-contents)

#### Constructor: `Client()`

The `Client` constructor takes a single object as it's argument which has the
following interface:

```ts
interface ClientConstructor_Argument {
  delimiter?: string;
  socketRoot?: string;
  path: Listen_Argument["path"];
}
```

| property   | default value | description                                                      |
| ---------- | ------------- | ---------------------------------------------------------------- |
| delimiter  | `"\f"`        | See [ServerConstructor_Argument.delimiter](#constructor-server)  |
| socketRoot | `os.tmpdir()` | See [ServerConstructor_Argument.socketRoot](#constructor-server) |
| path       |               | See [Listen_Argument.path](#serverlisten)                        |

Go to [Table Of Contents](#table-of-contents)

#### `client.subscribe()`

Subscribe to channels. It has the following signature:

```ts
subscribe(
  ...channelsRestArg: (string | string[])[]
): Promise<ResponsePayload>
```

See [ResponsePayload](#responsepayload)

**Example:**

```ts
await client.subscribe("a", "b", ["c", "d"], "e");
```

Go to [Table Of Contents](#table-of-contents)

#### `client.unsubscribe()`

Unsubscribe to channels. It has the following signature:

```ts
unsubscribe(
  ...channelsRestArg: (string | string[])[]
): Promise<ResponsePayload>
```

See [ResponsePayload](#responsepayload)

**Example:**

```ts
await client.unsubscribe(["a", "b"], "c", "d", "e");
```

Go to [Table Of Contents](#table-of-contents)

#### `client.request()`

This method can be used to make request to the server. It has the following
signature:

```ts
interface Request_Argument {
  url: string;
  query?: object;
  headers?: object;
  body?: object | null;
  method: "get" | "post" | "delete" | "patch";
}

type request = (arg: Request_Argument) => Promise<ResponsePayload>;
```

See [ResponsePayload](#responsepayload)

Only the `url` and `method` property is required and the rest are optional.

**Example:**

```js
const users = await client.request({ url: "/users", method: "get" });
```

Go to [Table Of Contents](#table-of-contents)

#### `client.get()`

The get method is similar to the `client.request` method. It just sets the
`method` property to `"get"` for us.

It has the following signature:

```ts
type get = (
  url: string,
  other?: {
    query?: object;
    headers?: object;
    body?: object | null;
  }
) => Promise<ResponsePayload>;
```

See [ResponsePayload](#responsepayload)

The `other` parameter is optional, so are all of its properties.

**Example:**

```js
const users = await client.get("/users", {
  headers: { "x-auth-token": "aa9fa6d82308" },
});
```

Go to [Table Of Contents](#table-of-contents)

#### `client.delete()`

Sends a request with the request-method set to `"delete"`. It has exactly
the same signature as the [`client.get()`](#clientget) method.

Go to [Table Of Contents](#table-of-contents)

#### `client.post()`

Sends a request with the request-method set to `"post"`. Signature:

```ts
type post = (
  url: string,
  other: {
    query?: object;
    headers?: object;
    body: object | null;
  }
) => Promise<ResponsePayload>;
```

See [ResponsePayload](#responsepayload)

For the `client.post` method the second parameter is required and it's `body`
property is also required.

**Example:**

```js
const user = { id: 1, name: "Alex" };
const response = await client.post("/users", { body: user });
```

Go to [Table Of Contents](#table-of-contents)

#### `client.patch()`

Sends a request with the request-method set to `"patch"`. It has exactly
the same signature as [`client.post()`](#clientpost) method.

**Example:**

```js
const edited = await client.patch("/users/1", {
  body: { name: "Alex Smith" },
});
```

Go to [Table Of Contents](#table-of-contents)

#### `client.on()`

The `Client` class inherits from the `EventEmitter` class. It only emits two
events: `"error"` and `"broadcast"`. We can use the `client.on` method to
subscribe to these events.

Go to [Table Of Contents](#table-of-contents)

##### Receiving Broadcasts

We can receive broadcasts by adding an event listener on the `"broadcast"`
event. The broadcast data has the following interface:

```ts
interface Broadcast {
  data: any;
  channel: string;
}
```

**Example:**

```js
client.on("broadcast", (data) => {});
```

Go to [Table Of Contents](#table-of-contents)

##### Handling Errors

Subscribe to the `"error"` event to get notified about any errors.

**Example:**

```js
client.on("error", (error) => {});
```

Go to [Table Of Contents](#table-of-contents)

#### `client.close()`

Closes the underlying socket and no requests can be sent after the socket is
closed.

## Todo

- [ ] Do thorough testing (currently coverage is `88%`).
- [ ] Support data formats other than JSON (e.g., Buffer)

## Development

```bash
# Run tests
npm test
# Run tests in watch mode
npm test:watch
# Run tests with coverage
npm test:coverage

# Build / Bundle
npm run build
```

If you find a bug or want to improve something please feel free to open an
issue. Pull requests are also welcomed 💝. Finally, if you appreciate me writing
a docs of 900 liens, please give this project a ⭐ on github. So that, I can
feel a little better about the time I spent/wasted on this project.
