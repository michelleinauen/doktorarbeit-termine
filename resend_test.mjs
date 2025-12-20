import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { Resend } from "resend";

console.log("TEST START");
console.log("CWD =", process.cwd());
console.log("MAIL_FROM =", process.env.MAIL_FROM);
console.log(
  "RESEND_API_KEY present =",
  !!process.env.RESEND_API_KEY,
  "startsWith re_ =",
  (process.env.RESEND_API_KEY || "").startsWith("re_")
);

async function main() {
  const resend = new Resend(process.env.RESEND_API_KEY);

  const result = await resend.emails.send({
    from: process.env.MAIL_FROM,
    to: "michelle.inauen@hotmail.com", // <-- HIER ersetzen
    subject: "Resend Test",
    text: "Wenn du das liest, funktioniert der API Key.",
  });

  console.log("SEND RESULT =", result);
}

main().catch((e) => {
  console.error("ERROR =", e);
  process.exit(1);
});

