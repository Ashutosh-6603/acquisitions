export const cookies = {
  getOptions: () => ({
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAfge: 15 * 60 * 1000, // 15 minutes
  }),
  set: (res, name, value, option = {}) => {
    res.cookie(name, value, { ...cookies.getOptions(), ...option });
  },
  clear: (res, name, options) => {
    res.clearCookie(name, { ...cookies.getOptions(), ...options });
  },

  get: (req, name) => {
    return req.cookies[name];
  },
};
