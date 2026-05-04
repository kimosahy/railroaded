import { permanentRedirect } from "next/navigation";

export default function SessionsRedirect() {
  permanentRedirect("/theater");
}
