import passport from 'passport';

// Serialize user
passport.serializeUser((user: any, done) => {
  done(null, user);
});

// Deserialize user
passport.deserializeUser((user: any, done) => {
  done(null, user);
});

export default passport;