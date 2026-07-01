(function () {

if(localStorage.getItem("strakara-cookie-choice")) return;

const css=`
#sk-cookie{
position:fixed;
bottom:20px;
left:20px;
right:20px;
max-width:820px;
margin:auto;
background:#1E1F23;
color:#fff;
padding:22px;
border-radius:14px;
box-shadow:0 20px 60px rgba(0,0,0,.25);
z-index:999999;
font-family:Outfit,sans-serif;
display:flex;
gap:20px;
align-items:center;
flex-wrap:wrap;
}
#sk-cookie h3{
margin:0 0 8px;
font-size:18px;
font-weight:600;
}
#sk-cookie p{
margin:0;
font-size:14px;
line-height:1.6;
color:#ddd;
flex:1;
}
#sk-cookie-buttons{
display:flex;
gap:10px;
flex-wrap:wrap;
}
.sk-btn{
padding:11px 18px;
border:none;
cursor:pointer;
border-radius:30px;
font-weight:600;
font-size:14px;
}
.sk-accept{
background:#C8A96A;
color:#1E1F23;
}
.sk-refuse{
background:#333;
color:white;
}
.sk-settings{
background:transparent;
border:1px solid #666;
color:white;
}
`;

const style=document.createElement("style");
style.innerHTML=css;
document.head.appendChild(style);

const div=document.createElement("div");
div.id="sk-cookie";

div.innerHTML=`
<p>
<strong>Cookies STRAKARA</strong><br>
Nous utilisons uniquement les cookies nécessaires au fonctionnement du site.
Les cookies statistiques ou marketing sont utilisés uniquement avec votre accord.
</p>

<div id="sk-cookie-buttons">
<button class="sk-btn sk-accept">Accepter</button>
<button class="sk-btn sk-refuse">Refuser</button>
<a class="sk-btn sk-settings"
href="https://www.strakara.fr/politique-confidentialite.html">
En savoir plus
</a>
</div>
`;

document.body.appendChild(div);

div.querySelector(".sk-accept").onclick=function(){

localStorage.setItem("strakara-cookie-choice","accepted");

document.dispatchEvent(new Event("cookiesAccepted"));

div.remove();

};

div.querySelector(".sk-refuse").onclick=function(){

localStorage.setItem("strakara-cookie-choice","refused");

div.remove();

};

})();
