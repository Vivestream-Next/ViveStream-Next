import { render } from "solid-js/web";
import "@phosphor-icons/web/regular";
import "@phosphor-icons/web/bold";
import "@phosphor-icons/web/fill";
import "./index.css";
import App from "./App";

const root = document.getElementById("root");
if (root) {
  render(() => <App />, root);
}
