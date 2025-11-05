import ColorHash from "color-hash";

// Create one shared instance
const colorHash = new ColorHash();

// Helper function to generate consistent color for a user
export const generateUserColor = (input :string) : string => {
  return colorHash.hex(input || Math.random().toString());
};