// socket.js
// import { io } from "socket.io-client";
// const socket = io("http://localhost:3000", {
//   transports: ["websocket"],
// });
// export default socket;

import { io } from "socket.io-client";
const socket = io("ws://localhost:5000"); // pastikan sesuai PORT yang dipakai di server.js
export default socket;
