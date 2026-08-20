declare module "nodemailer" {
  type MailOptions = {
    from: string;
    to: string | string[];
    subject: string;
    html: string;
    text?: string;
  };

  type SendMailResult = {
    rejected?: string[];
  };

  type Transporter = {
    sendMail: (options: MailOptions) => Promise<SendMailResult>;
  };

  type CreateTransportOptions = {
    host: string;
    port: number;
    secure: boolean;
    auth?: {
      user: string;
      pass: string;
    };
  };

  const nodemailer: {
    createTransport: (options: CreateTransportOptions) => Transporter;
  };

  export default nodemailer;
}
