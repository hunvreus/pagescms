import { Message } from "@/components/message";

export default function NotFound() {
  return (
    <Message
      title="Not found."
      description={<>Could not find requested resource.</>}
      className="absolute inset-0"
      cta="Go home"
      href="/"
    />
  )
}