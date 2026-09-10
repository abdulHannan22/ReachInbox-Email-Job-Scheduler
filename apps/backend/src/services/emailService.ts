import nodemailer from "nodemailer";

export const sendEmail = async (to: string, subject: string, body: string) => {
  if (!to || !to.includes("@")) {
    throw new Error(`Invalid recipient email: ${to}`);
  }
  // Use Ethereal for testing
  const transporter = nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    auth: {
      user: process.env.ETHEREAL_USER,
      pass: process.env.ETHEREAL_PASS,
    },
  });

  // Verify transporter credentials once per send so auth failures are clear.
  try {
    await transporter.verify();
  } catch (err: any) {
    throw new Error(`SMTP connection failed: ${err?.message ?? err}`);
  }

  const info = await transporter.sendMail({
    from: `"ReachInbox" <${process.env.ETHEREAL_USER}>`,
    to,
    subject,
    text: body,
  });

  console.log("Message sent: %s", info.messageId);
  console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));

  return info;
};

