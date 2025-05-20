import * as React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
  Tailwind,
} from "@react-email/components";

export const InviteEmailTemplate = ({
  email,
  repoName,
  inviteUrl,
  invitedByName,
  invitedByUrl
}: {
  email: string,
  repoName: string,
  inviteUrl: string,
  invitedByName: string,
  invitedByUrl: string,
}) => {
  const baseUrl = process.env.BASE_URL
    ? process.env.BASE_URL
    : process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "";

  return (
    <Html>
      <Head />
      <Preview>{invitedByName} invited you to &quot;{repoName}&quot;</Preview>
      <Tailwind>
        <Body className="bg-white my-auto mx-auto font-sans px-2 antialiased">
          <Container className="rounded my-[40px] mx-auto p-[20px] max-w-[465px]">
            <Section className="mt-[24px]">
              <Img
                src={`${baseUrl}/images/email-logo.png`}
                width="36"
                height="36"
                alt="Pages CMS"
                className="my-0 mx-auto"
              />
            </Section>
            <Heading className="text-[#0a0a0a] text-[24px] font-semibold p-0 my-[30px] mx-0 text-center tracking-tight">
              Join &quot;{repoName}&quot; on Pages CMS
            </Heading>
            <Text className="text-[#0a0a0a] text-[16px] leading-[24px]"><Link href={invitedByUrl} className="text-[#0a0a0a] underline rounded-md">{invitedByName}</Link> has invited you to the &quot;{repoName}&quot; project on Pages CMS. Use the following link to start collaborating:</Text>
            <Section className="text-center mt-[24px] mb-[24px]">
              <Button
                className="bg-[#171717] rounded-lg text-white text-[14px] font-medium no-underline text-center px-5 py-3"
                href={inviteUrl}
              >
                Join &quot;{repoName}&quot;
              </Button>
            </Section>
            <Text className="text-[#0a0a0a] text-[16px] leading-[24px]">
              or copy and paste this URL into your browser:{" "}
            </Text>
            <Text className="text-[#0a0a0a] text-[16px] leading-[24px]">
              <Link href={inviteUrl} className="text-[#0a0a0a] underline rounded-md">
                {inviteUrl}
              </Link>
            </Text>
            <Text className="text-[#737373] text-[14px] leading-[24px] mt-[36px]">
              This email was intended for <Link href={`mailto:${email}`} className="text-[#737373] underline">{email}</Link>. If you think this is a mistake, you can safely ignore this email.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};