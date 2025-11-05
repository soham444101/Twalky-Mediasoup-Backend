import { OAuth2Client } from "google-auth-library";
const client = new OAuth2Client(`${process.env.CLIENTID}`);

async function verifyToken(idToken: string) {
  const ticket = await client.verifyIdToken({
    idToken,
    audience: `${process.env.CLIENTID}`,
  });
  const payload = ticket.getPayload();
  return {
    email: payload?.email,
    name: payload?.name,
    picture: payload?.picture,
  };
}
export default verifyToken;
