/*
 * Marvel Chat V2
 * js/state.js
 *
 * Central application state.
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

    lowData: localStorage.getItem("marvel_low_data") === "1",
    theme: localStorage.getItem("marvel_theme") || "light",

    installPrompt: null,

    unsubs: {
        posts: null,
        conversations: null,
        messages: null,
        skills: null,
        requests: null,
        listings: null
    }
};
