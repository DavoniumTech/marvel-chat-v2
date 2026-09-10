import{state,escapeHtml,friendly,formatDate}from"../state.js";import{db,collection,doc,updateDoc,deleteDoc,addDoc,serverTimestamp,getDocs,query,where,limit}from"../firebase/firestore.js";import{showModal,closeModal}from"../components/modal.js";import{toast}from"../components/toast.js";import{createConversation,openConversation}from"./chat.js";

const marketCategories=["All","Electronics","Phones","Computers","Fashion","Books","Education","Home","Food","Services","Beauty","Sports","Vehicles","Other"];
const conditions=["New","Like New","Good","Fair","Used"];

const listingExpiryOptions=[
{hours:720,label:"30 days"},
{hours:12,label:"12 hours"},
{hours:24,label:"24 hours"},
{hours:168,label:"1 week"},
{hours:336,label:"2 weeks"}
];

function listingTimestamp(value){
if(value?.toMillis)return value.toMillis();
if(value?.toDate)return value.toDate().getTime();
if(!value)return 0;
const time=new Date(value).getTime();
return Number.isFinite(time)?time:0;
}

function isListingExpired(listing){
if(!listing?.expiresAt)return false;
const expiresAt=listingTimestamp(listing.expiresAt);
return expiresAt>0&&expiresAt<=Date.now();
}

function formatListingExpiry(listing){
if(!listing?.expiresAt)return"No expiry";
const expiresAt=listingTimestamp(listing.expiresAt);
if(!expiresAt)return"Expiry unavailable";
const remaining=expiresAt-Date.now();
if(remaining<=0)return"Expired";
const totalHours=Math.ceil(remaining/(60*60*1000));
if(totalHours<24)return`Expires in ${totalHours}h`;
return`Expires in ${Math.ceil(totalHours/24)}d`;
}

function getUid(){
return state.user?.uid||null;
}

function getMyListings(){
const uid=getUid();
if(!uid)return[];
return(state.listings||[]).filter(listing=>listing?.uid===uid);
}

function listingTime(listing){
if(listing?.createdAt?.toMillis)return listing.createdAt.toMillis();
if(listing?.createdAt?.toDate)return listing.createdAt.toDate().getTime();
if(listing?.createdAt){
const time=new Date(listing.createdAt).getTime();
return Number.isFinite(time)?time:0;
}
return 0;
}

function getShopName(listing,profile=null){
return profile?.marketAccount?.storeName||
profile?.displayName||
profile?.username||
listing?.username||
"Market Seller";
}

function getSellerName(listing,profile=null){
return profile?.displayName||
profile?.username||
listing?.sellerName||
listing?.sellerUsername||
listing?.username||
"Market Seller";
}

function formatNaira(value){
const number=Number(value);
if(!Number.isFinite(number))return"Price not set";
return`₦${number.toLocaleString("en-NG")}`;
}

function getValidPrices(listings){
return listings
.map(listing=>Number(listing?.price))
.filter(price=>Number.isFinite(price)&&price>=0);
}

function getShopPriceLabel(listings){
const prices=getValidPrices(listings);
if(!prices.length)return"Price not set";
const lowest=Math.min(...prices);
if(listings.length===1)return formatNaira(lowest);
return`Starting at ${formatNaira(lowest)}`;
}

function getShopPriceRange(listings){
const prices=getValidPrices(listings);
if(!prices.length)return"Price not set";
const lowest=Math.min(...prices);
const highest=Math.max(...prices);
if(lowest===highest)return formatNaira(lowest);
return`${formatNaira(lowest)} – ${formatNaira(highest)}`;
}

function getShopDescription(profile,listing=null){
return profile?.marketAccount?.bio||
profile?.marketAccount?.description||
listing?.shopDescription||
"Community Marvel Market shop.";
}

function getShopLocation(profile,listing=null){
return profile?.marketAccount?.location||
profile?.country||
listing?.location||
listing?.country||
"Location not specified";
}

export function hasMarketAccount(){
const uid=getUid();
if(!uid)return false;
if(state.profile?.marketAccount?.active===true)return true;
return getMyListings().length>0;
}

async function migrateExistingSeller(){
const uid=getUid();
if(!uid||!state.profile)return;
if(state.profile.marketAccount?.active===true)return;

const listings=getMyListings();
if(!listings.length)return;

const account={
active:true,
storeName:state.profile.displayName||state.profile.username||"Market Seller",
bio:"",
location:state.profile.country||"",
migratedFromListing:true,
createdAt:serverTimestamp(),
updatedAt:serverTimestamp()
};

try{
await updateDoc(doc(db,"users",uid),{marketAccount:account});
state.profile={
...state.profile,
marketAccount:{
...account,
createdAt:new Date(),
updatedAt:new Date()
}
};
}catch(error){
console.warn("[Market] Existing seller migration skipped:",error);
}
}

export function showMarketAccountModal(renderApp){
if(!state.user){
toast("Please sign in first.");
return;
}

const account=state.profile?.marketAccount||{};
const existingSeller=getMyListings().length>0;
const accountExists=account.active===true||existingSeller;

showModal(
accountExists?"Manage Your Marvel Market Account":"Create Marvel Market Account",
`
<div style="display:flex;flex-direction:column;gap:14px;">

<div class="field">
<label>Seller / Store name *</label>
<input
class="input"
id="marketStoreName"
maxlength="80"
value="${escapeHtml(account.storeName||state.profile?.displayName||state.profile?.username||"")}"
placeholder="Your shop name"
>
</div>

<div class="field">
<label>Shop description</label>
<textarea
class="textarea"
id="marketSellerBio"
maxlength="300"
rows="4"
placeholder="Tell buyers what your shop sells..."
>${escapeHtml(account.bio||account.description||"")}</textarea>
</div>

<div class="field">
<label>Shop location</label>
<input
class="input"
id="marketSellerLocation"
maxlength="100"
value="${escapeHtml(account.location||state.profile?.country||"")}"
placeholder="e.g. Kano, Nigeria"
>
</div>

<div
class="card"
style="
background:var(--surface2);
padding:16px;
margin:0;
box-shadow:none;
border-radius:18px;
"
>
<div style="display:flex;align-items:center;gap:12px;">
<div style="
width:46px;
height:46px;
border-radius:14px;
display:flex;
align-items:center;
justify-content:center;
font-size:24px;
background:var(--surface);
">🛍️</div>

<div style="min-width:0;">
<strong style="display:block;font-size:16px;">
Your Marvel Market Shop
</strong>

<p class="small"style="margin:4px 0 0;">
Your shop is where your products and services are displayed to buyers.
</p>
</div>
</div>
</div>

<button
class="btn btn-primary btn-block"
id="saveMarketAccount"
type="button"
>
${accountExists?"Save Marvel Market Account":"Create Marvel Market Account 🛍️"}
</button>

</div>
`
);

document.getElementById("saveMarketAccount")?.addEventListener("click",async()=>{
const nameInput=document.getElementById("marketStoreName");
const bioInput=document.getElementById("marketSellerBio");
const locationInput=document.getElementById("marketSellerLocation");

const storeName=nameInput?.value.trim()||"";
const bio=bioInput?.value.trim()||"";
const location=locationInput?.value.trim()||"";

if(!storeName){
toast("Enter your shop name.");
nameInput?.focus();
return;
}

if(storeName.length>80){
toast("Shop name must be 80 characters or less.");
nameInput?.focus();
return;
}

if(bio.length>300){
toast("Shop description must be 300 characters or less.");
bioInput?.focus();
return;
}

if(location.length>100){
toast("Shop location must be 100 characters or less.");
locationInput?.focus();
return;
}

const button=document.getElementById("saveMarketAccount");
if(!button)return;

button.disabled=true;
button.textContent="Saving...";

try{
const marketAccount={
active:true,
storeName,
bio,
location,
createdAt:account.createdAt||new Date(),
updatedAt:serverTimestamp()
};

await updateDoc(
doc(db,"users",state.user.uid),
{marketAccount}
);

state.profile={
...state.profile,
marketAccount:{
...marketAccount,
updatedAt:new Date()
}
};

closeModal();

toast(
accountExists
?"Marvel Market Shop updated ✨"
:"Marvel Market Shop created 🛍️"
);

if(typeof renderApp==="function")renderApp();

}catch(error){
console.error("[Market] Account save failed:",error);
toast(friendly(error));
button.disabled=false;
button.textContent=accountExists
?"Save Marvel Market Account"
:"Create Marvel Market Account 🛍️";
}
});
}

function isBrowseMode(){
return state.marketBrowseMode===true;
}

function enterBrowseMode(renderApp){
state.marketBrowseMode=true;
if(typeof renderApp==="function")renderApp();
}

function exitBrowseMode(renderApp){
state.marketBrowseMode=false;
state.search="";
if(typeof renderApp==="function")renderApp();
}

function buildShopGroups(listings){
const map=new Map();

listings.forEach(listing=>{
if(!listing)return;

const shopId=listing.uid||`legacy:${listing.username||listing.id}`;

if(!map.has(shopId)){
map.set(shopId,{
id:shopId,
uid:listing.uid||null,
name:listing.username||"Community Shop",
listings:[],
latest:listing
});
}

const shop=map.get(shopId);
shop.listings.push(listing);

if(listingTime(listing)>listingTime(shop.latest)){
shop.latest=listing;
}
});

return Array.from(map.values());
}

export function renderMarket(renderApp){
migrateExistingSeller();

const seller=hasMarketAccount();
const browse=isBrowseMode();
const showMarketplaceTools=seller||browse;

const queryText=showMarketplaceTools
?(state.search||"").toLowerCase().trim()
:"";

const selectedCategory=state.marketCategory||"All";
const marketTab=seller?(state.marketTab||"browse"):"browse";
const sortBy=state.marketSort||"newest";

let matchingListings=(state.listings||[]).filter(listing=>{
if(!listing)return false;

const isMineTab=seller&&marketTab==="mine";

if(isMineTab){
if(listing.uid!==getUid())return false;
}else{
if(listing.status==="sold")return false;
if(isListingExpired(listing))return false;
}

const haystack=`
${listing.title||""}
${listing.description||""}
${listing.username||""}
${listing.sellerName||""}
${listing.sellerUsername||""}
${listing.category||""}
${listing.location||""}
${listing.country||""}
`.toLowerCase();

const matchesSearch=
!queryText||haystack.includes(queryText);

const matchesCategory=
selectedCategory==="All"||
(listing.category||"Other")===selectedCategory;

return matchesSearch&&matchesCategory;
});

matchingListings.sort((a,b)=>{
if(sortBy==="price-low"||sortBy==="price-high"){
const priceA=Number(a?.price);
const priceB=Number(b?.price);
const safeA=Number.isFinite(priceA)?priceA:Number.POSITIVE_INFINITY;
const safeB=Number.isFinite(priceB)?priceB:Number.POSITIVE_INFINITY;
return sortBy==="price-low"
?safeA-safeB
:safeB-safeA;
}

const timeA=listingTime(a);
const timeB=listingTime(b);
return sortBy==="oldest"
?timeA-timeB
:timeB-timeA;
});

const shops=buildShopGroups(matchingListings);
const myListingsCount=getMyListings().length;

return`
<div class="page market-page">

<section
class="hero"
style="
position:relative;
overflow:hidden;
"
>
<div style="
position:absolute;
right:18px;
top:14px;
font-size:46px;
opacity:.16;
pointer-events:none;
">🛍️</div>

<h1>Marvel Market 🛍️</h1>

<p>
Discover shops, products and services
from the Marvel Chat community.
</p>
</section>

${
seller
?`
<div
class="card"
style="
margin-bottom:12px;
padding:14px;
box-shadow:none;
background:var(--surface2);
"
>
<div
style="
display:flex;
align-items:center;
justify-content:space-between;
gap:12px;
flex-wrap:wrap;
"
>

<div
style="
display:flex;
align-items:center;
gap:10px;
min-width:0;
"
>

<div
class="avatar"
style="
font-size:18px;
flex-shrink:0;
"
>🛍️</div>

<div style="min-width:0;">
<strong
style="
display:block;
font-size:17px;
font-weight:900;
overflow-wrap:anywhere;
"
>
${escapeHtml(
state.profile?.marketAccount?.storeName||
state.profile?.displayName||
"Market Seller"
)}
</strong>

<div class="small">
Marvel Market Shop active
</div>
</div>

</div>

<button
class="btn btn-ghost"
id="manageMarketAccountBtn"
type="button"
style="font-size:13px;"
>
Manage Shop
</button>

</div>
</div>
`
:""
}

${
!showMarketplaceTools
?`
<div
class="card"
style="
padding:32px 20px;
text-align:center;
margin-bottom:14px;
border-radius:22px;
"
>
<div style="
font-size:48px;
margin-bottom:10px;
">🛍️</div>

<h3 style="margin:0 0 7px;">
Explore Marvel Market
</h3>

<p
class="small"
style="
max-width:440px;
margin:0 auto 20px;
"
>
Browse shops, products and services
from community members.
</p>

<button
class="btn btn-primary"
id="browseMarketBtn"
type="button"
>
Browse Market
</button>
</div>
`
:""
}

${
showMarketplaceTools
?`
<div
class="search"
style="
margin-bottom:12px;
align-items:center;
"
>

<input
class="input"
id="marketSearch"
value="${escapeHtml(state.search||"")}"
placeholder="Search shops, products, categories..."
autocomplete="off"
>

${
seller
?`
<button
class="btn btn-primary"
id="sellBtn"
type="button"
style="
white-space:nowrap;
min-width:max-content;
"
>
+ Sell
</button>
`
:""
}

</div>

${
seller
?`
<div
class="segmented"
style="
margin-bottom:12px;
"
>

<button
class="btn ${
marketTab==="browse"
?"btn-primary"
:"btn-ghost"
}"
id="browseTabBtn"
type="button"
style="flex:1;"
>
Browse Market
</button>

<button
class="btn ${
marketTab==="mine"
?"btn-primary"
:"btn-ghost"
}"
id="myListingsTabBtn"
type="button"
style="flex:1;"
>
My Shop (${myListingsCount})
</button>

</div>
`
:""
}

<div
class="category-row"
style="
margin-bottom:10px;
display:flex;
gap:6px;
flex-wrap:wrap;
"
>
<div
style="
display:flex;
flex-direction:row;
flex-wrap:nowrap;
gap:5px;
overflow-x:auto;
overflow-y:hidden;
flex:1 1 auto;
min-width:0;
width:100%;
padding-bottom:5px;
white-space:nowrap;
scrollbar-width:none;
"
>
${marketCategories.map(category=>`
<button
class="btn ${
selectedCategory===category
?"btn-primary"
:"btn-ghost"
}"
data-market-category="${escapeHtml(category)}"
type="button"
style="
padding:5px 11px;
font-size:12px;
border-radius:999px;
flex:0 0 auto;
white-space:nowrap;
"
>
${escapeHtml(category)}
</button>
`).join("")}
</div>
</div>

<div
style="
display:flex;
justify-content:space-between;
align-items:center;
gap:8px;
margin-bottom:12px;
"
>

<div class="small">
${
matchingListings.length
?marketTab==="mine"
?`${matchingListings.length} ${matchingListings.length===1?"product":"products"} in your shop`
:`${matchingListings.length} available ${matchingListings.length===1?"listing":"listings"}`
:""
}
</div>

<select
class="select"
id="marketSortSelect"
style="
max-width:170px;
width:100%;
"
>
<option value="newest"${sortBy==="newest"?" selected":""}>
Newest shops
</option>

<option value="oldest"${sortBy==="oldest"?" selected":""}>
Oldest shops
</option>

<option value="price-low"${sortBy==="price-low"?" selected":""}>
Lowest price first
</option>

<option value="price-high"${sortBy==="price-high"?" selected":""}>
Highest price first
</option>
</select>

</div>

${
!seller&&browse
?`
<button
class="btn btn-ghost"
id="closeBrowseMarketBtn"
type="button"
style="
margin-bottom:12px;
font-size:13px;
"
>
← Back
</button>
`
:""
}
`
:""
}

<div id="marketItems">

${
showMarketplaceTools&&shops.length
?`
<div class="list">
${shops.map(shop=>{
const latest=shop.latest||shop.listings[0];

const shopName=
shop.uid===getUid()
?(state.profile?.marketAccount?.storeName||shop.name)
:shop.name;

const sellerName=
shop.uid===getUid()
?getSellerName(latest,state.profile)
:(latest?.sellerName||latest?.sellerUsername||"Seller");

const productCount=shop.listings.length;
const availableShopListings=shop.listings.filter(
listing=>listing.status!=="sold"&&!isListingExpired(listing)
);
const priceListings=availableShopListings.length
?availableShopListings
:shop.listings;
const categories=Array.from(
new Set(
shop.listings
.map(item=>item.category)
.filter(Boolean)
)
);

const shopPriceLabel=getShopPriceLabel(priceListings);
const shopPriceRange=getShopPriceRange(priceListings);

return`
<div
class="list-item"
data-view-shop="${escapeHtml(shop.uid||"")}"
data-view-listing="${escapeHtml(latest?.id||"")}"
style="
cursor:pointer;
width:100%;
padding:14px;
"
>

<div
style="
display:flex;
gap:12px;
align-items:flex-start;
width:100%;
"
>

<div
class="avatar"
style="
font-size:18px;
flex-shrink:0;
"
>
🛍️
</div>

<div
class="profile-meta"
style="
flex:1;
min-width:0;
"
>

<div
style="
display:flex;
justify-content:space-between;
gap:10px;
align-items:flex-start;
"
>

<div style="min-width:0;">

<strong
style="
display:block;
font-size:18px;
font-weight:900;
overflow-wrap:anywhere;
"
>
${escapeHtml(shopName)}
</strong>

<span
class="small"
style="
display:block;
margin-top:3px;
"
>
Seller: ${escapeHtml(sellerName)}
</span>

<span
class="small"
style="
display:block;
margin-top:3px;
"
>
${productCount} ${productCount===1?"product":"products"}
${availableShopListings.length
?` · ${availableShopListings.length} available`
:""}
</span>

<span
class="small"
style="
display:block;
margin-top:3px;
"
>
${categories.length
?`Category: ${escapeHtml(categories.slice(0,3).join(" · "))}`
:"Category: Other"
}
</span>

</div>

<div
style="
text-align:right;
flex-shrink:0;
"
>
<strong
style="
color:var(--primary);
font-size:16px;
white-space:nowrap;
font-variant-numeric:tabular-nums;
"
>
${escapeHtml(shopPriceLabel)}
</strong>
<div
class="small"
style="margin-top:3px;text-align:right;"
>
${productCount>1?`Range: ${escapeHtml(shopPriceRange)}`:""}
</div>
</div>

</div>

<p
class="small"
style="
margin:7px 0 5px;
color:var(--text-secondary);
display:-webkit-box;
-webkit-line-clamp:2;
-webkit-box-orient:vertical;
overflow:hidden;
"
>
${escapeHtml(
shop.uid===getUid()
?getShopDescription(state.profile,latest)
:latest?.shopDescription||latest?.description||
"Open this shop to see all products and services."
)}
</p>

<div
style="
display:flex;
align-items:center;
justify-content:space-between;
gap:8px;
flex-wrap:wrap;
"
>

<span class="small">
${
latest?.location
?`📍 ${escapeHtml(latest.location)}`
:latest?.country
?`📍 ${escapeHtml(latest.country)}`
:""
}
</span>

<span
class="small"
style="
color:var(--primary);
font-weight:800;
"
>
View shop →
</span>

</div>

</div>

</div>

</div>
`;
}).join("")}
</div>
`
:showMarketplaceTools
?`
<div
class="card empty"
style="
padding:40px 20px;
text-align:center;
border-radius:20px;
"
>

<div
style="
font-size:40px;
margin-bottom:8px;
"
>
🛍️
</div>

<h3>
${
seller&&marketTab==="mine"
?"Your shop has no products yet"
:"No shops found"
}
</h3>

<p
class="small"
style="
margin-bottom:16px;
color:var(--text-secondary);
"
>
${
seller&&marketTab==="mine"
?"Create your first Marvel Market listing."
:"Try another search or category."
}
</p>

${
seller&&marketTab==="mine"
?`
<button
class="btn btn-primary"
id="emptySellBtn"
type="button"
>
Sell something
</button>
`
:""
}

</div>
`
:""
}

</div>

</div>
`;
}

export function showSellModal(renderApp,existingListing=null){
const editing=Boolean(existingListing);

if(editing&&existingListing.uid!==getUid()){
toast("You can only edit your own listings.");
return;
}

if(!editing&&!hasMarketAccount()){
toast("Create a Marvel Market Shop before selling.");
showMarketAccountModal(renderApp);
return;
}

const account=state.profile?.marketAccount||{};
const defaultCountry=state.profile?.country||"Nigeria";

showModal(
editing?"Edit Product":"Add Product to Your Shop",
`
<div
style="
display:flex;
flex-direction:column;
gap:13px;
"
>

<div class="field">
<label>Product / Service name *</label>

<input
class="input"
id="listingTitle"
maxlength="100"
value="${escapeHtml(existingListing?.title||"")}"
placeholder="What are you selling?"
>
</div>

<div class="field">
<label>Description *</label>

<textarea
class="textarea"
id="listingDescription"
rows="4"
maxlength="1000"
placeholder="Describe your product clearly..."
>${escapeHtml(existingListing?.description||"")}</textarea>

<div class="small"style="margin-top:4px;">
Maximum 1000 characters.
</div>
</div>

<div class="grid grid2">

<div class="field">
<label>Price (₦) *</label>

<input
class="input"
id="listingPrice"
type="number"
min="0"
step="1"
value="${existingListing?.price??""}"
placeholder="25000"
inputmode="numeric"
>
</div>

<div class="field">
<label>Category *</label>

<select
class="select"
id="listingCategory"
>
${marketCategories
.filter(category=>category!=="All")
.map(category=>`
<option
value="${escapeHtml(category)}"
${existingListing?.category===category?"selected":""}
>
${escapeHtml(category)}
</option>
`)
.join("")}
</select>
</div>

</div>

<div class="grid grid2">

<div class="field">
<label>Condition *</label>

<select
class="select"
id="listingCondition"
>
${conditions
.map(condition=>`
<option
value="${escapeHtml(condition)}"
${existingListing?.condition===condition?"selected":""}
>
${escapeHtml(condition)}
</option>
`)
.join("")}
</select>
</div>

<div class="field">
<label>Country *</label>

<input
class="input"
id="listingCountry"
maxlength="80"
value="${escapeHtml(existingListing?.country||defaultCountry)}"
placeholder="Nigeria"
>
</div>

</div>

<div class="field">
<label>Location / City</label>

<input
class="input"
id="listingLocation"
maxlength="100"
value="${escapeHtml(existingListing?.location||account.location||"")}"
placeholder="e.g. Kano, Nigeria"
>
</div>

<div
class="card"
style="
background:var(--surface2);
box-shadow:none;
padding:14px;
margin:0;
border-radius:17px;
"
>

<div
style="
display:flex;
align-items:center;
gap:10px;
"
>

<div
style="
font-size:23px;
width:40px;
height:40px;
display:flex;
align-items:center;
justify-content:center;
border-radius:12px;
background:var(--surface);
"
>
🛍️
</div>

<div>
<strong>Shop</strong>

<div class="small"style="margin-top:3px;">
${escapeHtml(
account.storeName||
state.profile?.displayName||
state.profile?.username||
"Your Shop"
)}
</div>
</div>

</div>

</div>

<div class="field">

<label>Listing duration *</label>

<select
class="select"
id="listingExpiryHours"
>
${listingExpiryOptions
.map(option=>`
<option
value="${option.hours}"
${
(!editing&&option.hours===720)||
Number(existingListing?.expiryDurationHours)===option.hours
?"selected":""
}
>
${escapeHtml(option.label)}
${option.hours===720?" — Default":""}
</option>
`)
.join("")}
</select>

<div
class="small"
style="margin-top:5px;"
>
30 days is the default. When a listing expires, it disappears from the public Marvel Market but remains in your shop for renewal.
</div>

</div>

${
editing&&isListingExpired(existingListing)
?`
<div
class="notice"
style="
display:flex;
align-items:flex-start;
gap:8px;
"
>
<span>⏰</span>
<span>
This listing has expired. Saving it will renew it for the selected duration.
</span>
</div>
`
:""
}

<button
class="btn btn-primary btn-block"
id="publishListing"
type="button"
>
${editing?"Save Changes":"Add Product to Shop 🛍️"}
</button>

</div>
`
);

document.getElementById("publishListing")?.addEventListener("click",async()=>{
const titleInput=document.getElementById("listingTitle");
const descriptionInput=document.getElementById("listingDescription");
const priceInput=document.getElementById("listingPrice");
const categoryInput=document.getElementById("listingCategory");
const conditionInput=document.getElementById("listingCondition");
const countryInput=document.getElementById("listingCountry");
const locationInput=document.getElementById("listingLocation");
const expiryInput=document.getElementById("listingExpiryHours");

const title=titleInput?.value.trim()||"";
const description=descriptionInput?.value.trim()||"";
const price=Number(priceInput?.value);
const category=categoryInput?.value||"";
const condition=conditionInput?.value||"";
const country=countryInput?.value.trim()||"";
const location=locationInput?.value.trim()||"";
const expiryDurationHours=Number(expiryInput?.value)||720;

if(!listingExpiryOptions.some(option=>option.hours===expiryDurationHours)){
toast("Select a valid listing duration.");
expiryInput?.focus();
return;
}

if(!title){
toast("Enter a product or service name.");
titleInput?.focus();
return;
}

if(title.length>100){
toast("Product name must be 100 characters or less.");
titleInput?.focus();
return;
}

if(!description){
toast("Enter a description.");
descriptionInput?.focus();
return;
}

if(description.length>1000){
toast("Description must be 1000 characters or less.");
descriptionInput?.focus();
return;
}

if(!Number.isFinite(price)||price<0){
toast("Enter a valid price.");
priceInput?.focus();
return;
}

if(!category){
toast("Select a category.");
return;
}

if(!condition){
toast("Select the condition.");
return;
}

if(!country){
toast("Enter a country.");
countryInput?.focus();
return;
}

if(country.length>80){
toast("Country must be 80 characters or less.");
countryInput?.focus();
return;
}

if(location.length>100){
toast("Location must be 100 characters or less.");
locationInput?.focus();
return;
}

if(!editing&&!hasMarketAccount()){
closeModal();
showMarketAccountModal(renderApp);
toast("A Marvel Market Shop is required to sell.");
return;
}

const button=document.getElementById("publishListing");
if(!button)return;

button.disabled=true;
button.textContent=editing?"Saving...":"Publishing...";

try{

const expiresAt=new Date(
Date.now()+expiryDurationHours*60*60*1000
);

if(editing){

await updateDoc(
doc(db,"listings",existingListing.id),
{
title,
description,
price,
category,
sellerName:state.profile?.displayName||state.profile?.username||existingListing?.sellerName||existingListing?.username||"Market Seller",
sellerUsername:state.profile?.username||existingListing?.sellerUsername||"",
condition,
country,
location,
expiryDurationHours,
expiresAt,
updatedAt:serverTimestamp()
}
);

toast(
isListingExpired(existingListing)
?"Product renewed successfully ✨"
:"Product updated ✨"
);

}else{

const sellerName=
state.profile?.marketAccount?.storeName||
state.profile?.displayName||
state.profile?.username||
"User";

await addDoc(
collection(db,"listings"),
{
uid:state.user.uid,
username:sellerName,
sellerName:state.profile?.displayName||state.profile?.username||sellerName,
sellerUsername:state.profile?.username||"",
title,
description,
price,
category,
condition,
country,
location,
expiryDurationHours,
expiresAt,
status:"active",
createdAt:serverTimestamp(),
updatedAt:serverTimestamp()
}
);

toast("Product added to your shop 🛍️");
}

closeModal();

if(typeof renderApp==="function"){
renderApp();
}

}catch(error){

console.error(
"[Market] Listing save error:",
error
);

toast(friendly(error));

button.disabled=false;
button.textContent=
editing
?"Save Changes"
:"Add Product to Shop 🛍️";
}
});
}

export async function showListingDetails(listingId,renderApp){
const listing=(state.listings||[]).find(
item=>item?.id===listingId
);

if(!listing){
toast("Listing not found.");
return;
}

if(listing.uid){
await showShopDetails(
listing.uid,
renderApp,
listing
);
return;
}

await showSingleListingDetails(
listing,
renderApp
);
}

async function showShopDetails(
sellerUid,
renderApp,
selectedListing=null
){

if(!sellerUid){
await showSingleListingDetails(
selectedListing,
renderApp
);
return;
}

try{

const userSnapshot=
await getDocs(
query(
collection(db,"users"),
where("uid","==",sellerUid),
limit(1)
)
);

let sellerProfile={
uid:sellerUid,
displayName:selectedListing?.username||"Market Seller",
username:selectedListing?.username||"Seller",
marketAccount:{}
};

if(!userSnapshot.empty){

sellerProfile={
id:userSnapshot.docs[0].id,
uid:userSnapshot.docs[0].id,
...userSnapshot.docs[0].data()
};

sellerProfile.uid=
sellerProfile.uid||sellerUid;
}

const listingSnapshot=
await getDocs(
query(
collection(db,"listings"),
where("uid","==",sellerUid)
)
);

let shopListings=
listingSnapshot.docs.map(
snapshot=>({
id:snapshot.id,
...snapshot.data()
})
);

if(!shopListings.length){

shopListings=
(state.listings||[]).filter(
listing=>listing.uid===sellerUid
);

}

shopListings.sort(
(a,b)=>listingTime(b)-listingTime(a)
);

const storeName=getShopName(
selectedListing,
sellerProfile
);

const shopDescription=getShopDescription(
sellerProfile,
selectedListing
);

const shopLocation=getShopLocation(
sellerProfile,
selectedListing
);

const isOwner=sellerUid===getUid();

const activeListings=
shopListings.filter(
listing=>
listing.status!=="sold"&&
!isListingExpired(listing)
);

const visibleShopListings=
isOwner
?shopListings
:activeListings;

const expiredCount=
shopListings.filter(
listing=>
listing.status!=="sold"&&
isListingExpired(listing)
).length;

const soldCount=shopListings.filter(
listing=>listing.status==="sold"
).length;

const availableCount=activeListings.length;
const shopCategories=Array.from(
new Set(
activeListings
.map(listing=>listing.category)
.filter(Boolean)
)
);
const shopPriceRange=getShopPriceRange(activeListings.length?activeListings:shopListings);
const shopSellerName=getSellerName(selectedListing,sellerProfile);

showModal(
storeName,
`
<div
style="
display:flex;
flex-direction:column;
gap:14px;
"
>

<div
class="card"
style="
margin:0;
background:var(--surface2);
box-shadow:none;
padding:17px;
border-radius:20px;
"
>

<div
style="
display:flex;
align-items:flex-start;
gap:12px;
"
>

<div class="avatar avatar-lg">
🛍️
</div>

<div
class="profile-meta"
style="
min-width:0;
flex:1;
"
>

<strong
style="
display:block;
font-size:23px;
font-weight:900;
overflow-wrap:anywhere;
"
>
${escapeHtml(storeName)}
</strong>

<p
class="small"
style="
margin:5px 0 4px;
"
>
${escapeHtml(shopDescription)}
</p>

<span class="small">
Seller: <strong>${escapeHtml(shopSellerName)}</strong>
</span>

<span class="small">
📍 ${escapeHtml(shopLocation)}
</span>

<div
style="
display:flex;
gap:6px;
flex-wrap:wrap;
margin-top:9px;
"
>

<span class="badge">
${availableCount} ${availableCount===1?"available product":"available products"}
</span>

${
isOwner&&expiredCount
?`
<span
class="badge"
style="
background:var(--surface);
color:var(--text);
"
>
⏰ ${expiredCount} expired
</span>
`
:""
}

</div>

</div>

</div>

</div>

<div
class="card"
style="
margin:0;
background:var(--surface2);
box-shadow:none;
padding:14px;
border-radius:18px;
"
>
<div
style="
display:grid;
grid-template-columns:repeat(2,minmax(0,1fr));
gap:9px 14px;
"
>
<div>
<div class="small">Products</div>
<strong>${shopListings.length}</strong>
</div>
<div>
<div class="small">Available now</div>
<strong>${availableCount}</strong>
</div>
<div>
<div class="small">Price range</div>
<strong>${escapeHtml(shopPriceRange)}</strong>
</div>
<div>
<div class="small">Categories</div>
<strong>${escapeHtml(shopCategories.length?shopCategories.slice(0,3).join(" · "):"Other")}</strong>
</div>
</div>
${isOwner&&soldCount?`<div class="small" style="margin-top:8px;">${soldCount} sold product${soldCount===1?"":"s"} in shop history.</div>`:""}
</div>

<div
style="
display:flex;
align-items:center;
justify-content:space-between;
gap:10px;
"
>

<div class="section-title"style="margin:0;">
<h2 style="margin:0;font-size:18px;">
Products from ${escapeHtml(storeName)}
</h2>
</div>

${
isOwner
?`
<button
class="btn btn-primary"
id="shopAddProductBtn"
type="button"
style="
font-size:12px;
white-space:nowrap;
"
>
+ Add
</button>
`
:""
}

</div>

<div
style="
display:flex;
flex-direction:column;
gap:9px;
"
>

${
visibleShopListings.length
?visibleShopListings.map(listing=>{

const expired=isListingExpired(listing);
const sold=listing.status==="sold";

return`
<button
class="list-item"
data-shop-product="${escapeHtml(listing.id)}"
type="button"
style="
width:100%;
text-align:left;
cursor:pointer;
background:var(--surface);
padding:14px;
opacity:${sold||expired?".78":"1"};
"
>

<div
style="
display:flex;
justify-content:space-between;
align-items:flex-start;
gap:12px;
width:100%;
"
>

<div
style="
min-width:0;
flex:1;
"
>

<div
style="
display:flex;
align-items:flex-start;
gap:7px;
flex-wrap:wrap;
"
>

<strong
style="
display:block;
font-size:17px;
font-weight:900;
overflow-wrap:anywhere;
"
>
${escapeHtml(listing.title||"Untitled product")}
</strong>

${
sold
?`
<span
class="badge"
style="
background:var(--danger);
color:#fff;
font-size:10px;
"
>
Sold
</span>
`
:expired
?`
<span
class="badge"
style="
background:var(--surface2);
color:var(--text);
font-size:10px;
"
>
Expired
</span>
`
:`
<span
class="badge"
style="
font-size:10px;
"
>
Available
</span>
`
}

</div>

<span
class="small"
style="
display:block;
margin-top:4px;
"
>
${escapeHtml(listing.category||"Other")}
·
${escapeHtml(listing.condition||"Condition not specified")}
·
${escapeHtml(listing.location||listing.country||"Location not specified")}
</span>

<span
class="small"
style="
display:block;
margin-top:3px;
"
>
Posted ${escapeHtml(formatDate(listing.createdAt))}
·
${escapeHtml(formatListingExpiry(listing))}
</span>

<p
class="small"
style="
margin:5px 0 0;
color:var(--text-secondary);
display:-webkit-box;
-webkit-line-clamp:2;
-webkit-box-orient:vertical;
overflow:hidden;
"
>
${escapeHtml(listing.description||"")}
</p>

${
isOwner&&expired&&!sold
?`
<div
class="small"
style="
margin-top:6px;
font-weight:800;
color:var(--primary);
"
>
🔄 Open to renew this listing
</div>
`
:""
}

</div>

<strong
style="
color:var(--primary);
font-size:17px;
white-space:nowrap;
flex-shrink:0;
font-variant-numeric:tabular-nums;
"
>
${formatNaira(listing.price)}
</strong>

</div>

</button>
`;
}).join("")
:`
<div
class="empty"
style="
text-align:center;
padding:24px 16px;
"
>
<div style="font-size:34px;margin-bottom:7px;">
🛍️
</div>

<h3>No products yet</h3>

<p class="small">
This shop has not published an available product yet.
</p>

${
isOwner
?`
<button
class="btn btn-primary"
id="emptyShopAddProductBtn"
type="button"
>
Add your first product
</button>
`
:""
}

</div>
`
}

</div>

${
isOwner
?`
<div
class="notice"
style="
display:flex;
align-items:flex-start;
gap:8px;
"
>
<span>💡</span>
<span>
Your expired listings stay here so you can renew them.
Sold listings also remain available in your shop history.
</span>
</div>
`
:`
<button
class="btn btn-primary btn-block"
id="messageSellerBtn"
type="button"
${activeListings.length?"":"disabled"}
>
💬 Contact Seller / Buy
</button>
`
}

</div>
`
);

document.querySelectorAll("[data-shop-product]").forEach(item=>{
item.addEventListener("click",()=>{
const productId=item.dataset.shopProduct;
const product=shopListings.find(
listing=>listing.id===productId
);

closeModal();

if(product){
showSingleListingDetails(
product,
renderApp,
sellerProfile
);
}
});
});

if(isOwner){

document.getElementById("shopAddProductBtn")
?.addEventListener("click",()=>{
closeModal();
showSellModal(renderApp);
});

document.getElementById("emptyShopAddProductBtn")
?.addEventListener("click",()=>{
closeModal();
showSellModal(renderApp);
});

}else{

document.getElementById("messageSellerBtn")
?.addEventListener("click",async()=>{

const button=
document.getElementById("messageSellerBtn");

if(!button)return;

button.disabled=true;
button.textContent="Opening chat...";

try{

const contactListing=
selectedListing&&
selectedListing.status!=="sold"&&
!isListingExpired(selectedListing)
?selectedListing
:activeListings[0];

if(!contactListing){
throw new Error(
"This shop has no available product."
);
}

await sendMarketplaceInterest(
sellerUid,
contactListing
);

closeModal();

await openExistingOrCreateSellerChat(
sellerProfile,
sellerUid,
renderApp
);

toast("Interest sent to the seller 🛍️");

}catch(error){

console.error(
"[Market] Contact seller failed:",
error
);

toast(friendly(error));

button.disabled=false;
button.textContent="💬 Contact Seller / Buy";
}

});

}

}catch(error){

console.error(
"[Market] Shop details failed:",
error
);

if(selectedListing){
await showSingleListingDetails(
selectedListing,
renderApp
);
return;
}

toast(friendly(error));
}
}

async function openExistingOrCreateSellerChat(
sellerProfile,
sellerUid,
renderApp
){

const myUid=getUid();

if(!myUid||!sellerUid||myUid===sellerUid){
throw new Error("Seller chat is unavailable.");
}

const snapshot=
await getDocs(
query(
collection(db,"conversations"),
where(
"participants",
"array-contains",
myUid
)
)
);

const existing=
snapshot.docs
.map(snapshotItem=>({
id:snapshotItem.id,
...snapshotItem.data()
}))
.filter(
conversation=>
Array.isArray(conversation.participants)&&
conversation.participants.length===2&&
conversation.participants.includes(sellerUid)
)
.sort(
(a,b)=>
listingTimestamp(b.updatedAt)-
listingTimestamp(a.updatedAt)
)[0];

if(existing?.id){

await openConversation(
existing.id,
renderApp
);

return existing;
}

await createConversation(
sellerProfile,
renderApp
);

return null;
}

async function sendMarketplaceInterest(
sellerUid,
listing
){

if(!sellerUid||!listing){
throw new Error(
"Seller or listing not found."
);
}

if(sellerUid===getUid()){
throw new Error(
"This is your listing."
);
}

if(listing.status==="sold"){
throw new Error(
"This listing has already been sold."
);
}

if(isListingExpired(listing)){
throw new Error(
"This Marvel Market listing has expired. The seller can renew it from their shop."
);
}

await addDoc(
collection(
db,
"users",
sellerUid,
"notifications"
),
{
actorUid:getUid(),

actorName:
state.profile?.displayName||
state.profile?.username||
"A community member",

text:
`is interested in your Marvel Market Shop listing "${listing.title||"Product"}" 🛍️`,

type:"marketplace_interest",

listingId:listing.id,

listingTitle:
listing.title||"Product",

read:false,

createdAt:serverTimestamp()
}
);
}

async function showSingleListingDetails(
listing,
renderApp,
sellerProfile=null
){

if(!listing){
toast("Listing not found.");
return;
}

const isOwner=listing.uid===getUid();

const postedDate=
formatDate(listing.createdAt);

const updatedDate=
listing.updatedAt
?formatDate(listing.updatedAt)
:null;

const sellerName=
getShopName(
listing,
sellerProfile
);

const sellerBio=
getShopDescription(
sellerProfile,
listing
);

const sellerLocation=
getShopLocation(
sellerProfile,
listing
);

const expired=
isListingExpired(listing);

const sold=
listing.status==="sold";

showModal(
listing.title||"Product Details",
`
<div
style="
display:flex;
flex-direction:column;
gap:14px;
"
>

<div
class="card"
style="
margin:0;
background:var(--surface2);
box-shadow:none;
padding:16px;
border-radius:20px;
"
>

<div
style="
display:flex;
align-items:flex-start;
gap:11px;
"
>

<div
class="avatar"
style="
font-size:18px;
flex-shrink:0;
"
>
🛍️
</div>

<div style="min-width:0;flex:1;">

<strong
style="
display:block;
font-size:20px;
font-weight:900;
overflow-wrap:anywhere;
"
>
${escapeHtml(sellerName)}
</strong>

${
sellerBio
?`
<p
class="small"
style="
margin:4px 0 0;
"
>
${escapeHtml(sellerBio)}
</p>
`
:""
}

<span class="small">
📍 ${escapeHtml(sellerLocation)}
</span>

</div>

</div>

</div>

<div
style="
display:flex;
justify-content:space-between;
align-items:flex-start;
gap:12px;
flex-wrap:wrap;
"
>

<div>

<div
style="
font-size:29px;
font-weight:900;
color:var(--primary);
white-space:nowrap;
font-variant-numeric:tabular-nums;
"
>
${formatNaira(listing.price)}
</div>

<div class="small">
${escapeHtml(postedDate)}

${
updatedDate&&updatedDate!==postedDate
?` · Updated ${escapeHtml(updatedDate)}`
:""
}

</div>

</div>

<div
style="
display:flex;
gap:6px;
flex-wrap:wrap;
justify-content:flex-end;
"
>

<span class="badge">
${escapeHtml(listing.category||"Other")}
</span>

<span
class="badge"
style="
background:var(--surface2);
color:var(--text);
"
>
${escapeHtml(listing.condition||"Good")}
</span>

${
sold
?`
<span
class="badge"
style="
background:var(--danger);
color:#fff;
"
>
Sold
</span>
`
:expired
?`
<span
class="badge"
style="
background:var(--surface2);
color:var(--text);
"
>
Expired
</span>
`
:`
<span class="badge">
Available
</span>
`
}

</div>

</div>

<div
class="card"
style="
background:var(--surface2);
padding:16px;
margin:0;
box-shadow:none;
border-radius:18px;
"
>

<strong
style="
display:block;
margin-bottom:7px;
font-size:13px;
text-transform:uppercase;
color:var(--muted);
"
>
Description
</strong>

<p
style="
white-space:pre-wrap;
word-break:break-word;
margin:0;
font-size:14px;
line-height:1.55;
"
>
${escapeHtml(listing.description||"")}
</p>

</div>

<div
class="small"
style="
background:var(--surface2);
padding:14px;
border-radius:17px;
display:flex;
flex-direction:column;
gap:7px;
"
>

<div>
📍 Location:
<strong>
${escapeHtml(
listing.location||
sellerLocation||
"Not specified"
)}
${
listing.country
?`, ${escapeHtml(listing.country)}`
:""
}
</strong>
</div>

<div>
📋 Status:
<strong>
${
sold
?"Sold"
:expired
?"Expired"
:"Active"
}
</strong>
</div>

<div>
⏰ Listing:
<strong>
${escapeHtml(formatListingExpiry(listing))}
</strong>
</div>

</div>

${
isOwner
?`
<div
style="
display:flex;
gap:8px;
flex-wrap:wrap;
"
>

${
expired&&!sold
?`
<button
class="btn btn-primary"
id="renewListingBtn"
type="button"
style="flex:1;min-width:120px;"
>
🔄 Renew
</button>
`
:""
}

<button
class="btn btn-secondary"
id="editListingBtn"
type="button"
style="flex:1;min-width:100px;"
>
✏️ Edit
</button>

<button
class="btn ${
sold
?"btn-secondary"
:"btn-ghost"
}"
id="toggleSoldBtn"
type="button"
style="flex:1;min-width:120px;"
>
${sold?"Reactivate":"Mark as Sold"}
</button>

<button
class="btn btn-danger"
id="deleteListingBtn"
type="button"
style="flex:1;min-width:100px;"
>
🗑️ Delete
</button>

</div>

${
expired&&!sold
?`
<div class="notice">
⏰ This listing is expired. Renew it to make it active again.
</div>
`
:""
}

`
:`
<button
class="btn btn-primary btn-block"
id="messageSellerBtn"
type="button"
${sold||expired?"disabled":""}
>
${
sold
?"Sold — Contact unavailable"
:expired
?"Expired — Seller must renew"
:"💬 Contact Seller / Buy"
}
</button>
`
}

</div>
`
);

if(isOwner){

document.getElementById("renewListingBtn")
?.addEventListener("click",()=>{
closeModal();
showSellModal(
renderApp,
listing
);
});

document.getElementById("editListingBtn")
?.addEventListener("click",()=>{
closeModal();
showSellModal(
renderApp,
listing
);
});

document.getElementById("toggleSoldBtn")
?.addEventListener("click",async()=>{

const button=
document.getElementById("toggleSoldBtn");

if(!button)return;

button.disabled=true;
button.textContent="Saving...";

try{

const newStatus=
listing.status==="sold"
?isListingExpired(listing)
?"sold"
:"active"
:"sold";

if(listing.status==="sold"&&isListingExpired(listing)){
throw new Error("Renew this listing before reactivating it.");
}

await updateDoc(
doc(db,"listings",listing.id),
{
status:newStatus,
updatedAt:serverTimestamp()
}
);

closeModal();

toast(
newStatus==="sold"
?"Product marked as sold 🏷️"
:"Product reactivated 🚀"
);

if(typeof renderApp==="function"){
renderApp();
}

}catch(error){

console.error(
"[Market] Status update failed:",
error
);

toast(friendly(error));

button.disabled=false;
button.textContent=
listing.status==="sold"
?"Reactivate"
:"Mark as Sold";
}

});

document.getElementById("deleteListingBtn")
?.addEventListener("click",()=>{

showModal(
"Delete Product?",
`
<div
style="
display:flex;
flex-direction:column;
gap:12px;
"
>

<p class="small">
Delete
<strong>
"${escapeHtml(listing.title||"Untitled product")}"
</strong>
permanently?
</p>

<div
class="notice"
style="
margin:0;
"
>
This removes the product from your Marvel Market shop permanently.
</div>

<div
style="
display:flex;
gap:8px;
margin-top:4px;
"
>

<button
class="btn btn-ghost"
style="flex:1;"
id="cancelDeleteListing"
type="button"
>
Cancel
</button>

<button
class="btn btn-danger"
style="flex:1;"
id="confirmDeleteListing"
type="button"
>
Delete
</button>

</div>

</div>
`
);

document.getElementById("cancelDeleteListing")
?.addEventListener("click",()=>{
showSingleListingDetails(
listing,
renderApp,
sellerProfile
);
});

document.getElementById("confirmDeleteListing")
?.addEventListener("click",async()=>{

const button=
document.getElementById("confirmDeleteListing");

if(!button)return;

button.disabled=true;
button.textContent="Deleting...";

try{

await deleteDoc(
doc(db,"listings",listing.id)
);

closeModal();

toast("Product deleted.");

if(typeof renderApp==="function"){
renderApp();
}

}catch(error){

console.error(
"[Market] Delete failed:",
error
);

toast(friendly(error));

button.disabled=false;
button.textContent="Delete";
}

});

});

return;
}

document.getElementById("messageSellerBtn")
?.addEventListener("click",async()=>{

const button=
document.getElementById("messageSellerBtn");

if(!button)return;

button.disabled=true;
button.textContent="Opening chat...";

try{

if(!listing.uid){
throw new Error(
"Seller account not found."
);
}

if(listing.status==="sold"){
throw new Error(
"This product has already been sold."
);
}

if(isListingExpired(listing)){
throw new Error(
"This Marvel Market listing has expired. The seller can renew it from their shop."
);
}

await sendMarketplaceInterest(
listing.uid,
listing
);

let contactProfile=sellerProfile;

if(!contactProfile){

const userSnapshot=
await getDocs(
query(
collection(db,"users"),
where("uid","==",listing.uid),
limit(1)
)
);

contactProfile={
uid:listing.uid,
username:listing.username||"Seller",
displayName:listing.username||"Seller"
};

if(!userSnapshot.empty){

contactProfile={
id:userSnapshot.docs[0].id,
uid:userSnapshot.docs[0].id,
...userSnapshot.docs[0].data()
};

contactProfile.uid=
contactProfile.uid||listing.uid;
}
}

closeModal();

await openExistingOrCreateSellerChat(
contactProfile,
listing.uid,
renderApp
);

toast("Interest sent to the seller 🛍️");

}catch(error){

console.error(
"[Market] Contact seller failed:",
error
);

toast(friendly(error));

button.disabled=false;
button.textContent="💬 Contact Seller / Buy";
}

});
}

function filterMarketListingsDom(){

const root=
document.getElementById("marketItems");

if(!root)return;

const queryText=
(state.search||"").toLowerCase().trim();

const cards=
root.querySelectorAll("[data-view-shop]");

if(!cards.length)return;

let visible=0;

cards.forEach(card=>{

const haystack=
(card.textContent||"").toLowerCase();

const show=
!queryText||
haystack.includes(queryText);

card.style.display=
show?"":"none";

if(show)visible+=1;
});

let hint=
document.getElementById(
"marketSearchEmptyHint"
);

if(visible===0&&queryText){

if(!hint){

hint=document.createElement("div");

hint.id=
"marketSearchEmptyHint";

hint.className=
"card empty";

hint.style.padding=
"24px 16px";

hint.style.textAlign=
"center";

hint.innerHTML=`
<div style="font-size:34px;margin-bottom:6px;">
🔎
</div>

<h3>No shops found</h3>

<p class="small">
Try another shop or product search.
</p>
`;

root.appendChild(hint);
}

hint.style.display="";

}else if(hint){

hint.style.display="none";
}
}

export function attachMarketEvents(renderApp){

document.getElementById("browseMarketBtn")
?.addEventListener("click",()=>{
enterBrowseMode(renderApp);
});

document.getElementById("closeBrowseMarketBtn")
?.addEventListener("click",()=>{
exitBrowseMode(renderApp);
});

document.getElementById("sellBtn")
?.addEventListener("click",()=>{
showSellModal(renderApp);
});

document.getElementById("emptySellBtn")
?.addEventListener("click",()=>{
showSellModal(renderApp);
});

document.getElementById("manageMarketAccountBtn")
?.addEventListener("click",()=>{
showMarketAccountModal(renderApp);
});

document.getElementById("browseTabBtn")
?.addEventListener("click",()=>{
state.marketTab="browse";
renderApp();
});

document.getElementById("myListingsTabBtn")
?.addEventListener("click",()=>{
state.marketTab="mine";
renderApp();
});

const searchInput=
document.getElementById("marketSearch");

if(searchInput){

searchInput.addEventListener(
"input",
event=>{
state.search=event.target.value;
filterMarketListingsDom();
}
);

searchInput.addEventListener(
"keydown",
event=>{
if(event.key==="Escape"){

searchInput.value="";
state.search="";

filterMarketListingsDom();

}
}
);

}

document.getElementById("marketSortSelect")
?.addEventListener(
"change",
event=>{
state.marketSort=event.target.value;
renderApp();
}
);

document.querySelectorAll(
"[data-market-category]"
).forEach(button=>{

button.addEventListener(
"click",
()=>{
state.marketCategory=
button.dataset.marketCategory;
renderApp();
}
);

});

document.querySelectorAll(
"[data-view-shop]"
).forEach(item=>{

item.addEventListener(
"click",
()=>{

const sellerUid=
item.dataset.viewShop;

const listingId=
item.dataset.viewListing;

const listing=
(state.listings||[]).find(
current=>current.id===listingId
);

if(sellerUid){

showShopDetails(
sellerUid,
renderApp,
listing||null
);

return;
}

if(listing){

showListingDetails(
listing.id,
renderApp
);

}

}
);

});

}
