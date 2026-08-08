/*
 * Marvel Chat V2
 *
 * Central application state.
 *
 * Feature-specific state must remain controlled
 * and must not create uncontrolled global variables.
 */

export const state = {
    user: null,
    profile: null,
    page: "home",

    posts: [],
    conversations: [],
    activeConversation: null,
    messages: [],

    skills: [],
    requests: [],
    listings: [],
    notifications: [],

    search: "",
    marketCategory: "all",
    timeTab: "offers",

    theme: "light",
    lowData: false,

    installPrompt: null,

    unsubs: []
};
