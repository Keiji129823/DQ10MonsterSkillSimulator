(async function(){
  "use strict";

  var $=function(selector){return document.querySelector(selector)};
  var cards=[],uid=0,SKILL_DATA,SKILL_MASTER,SKILL_EFFECTS,DEFAULT_NAMES,RECOMMENDED_BUILDS,monsterData={};
  var CATALOG_ORDER=[
    ["スライム","モーモン","プリズニャン","ホイミスライム","スライムナイト","キメラ","ねこまどう","リザードマン","バトルレックス","いたずらもぐら","ベビーサタン","ドラゴンキッズ","ドラキー","ブラウニー","キラーパンサー"],
    ["メタッピー","たけやりへい","ニードルマン","フォンデュ","エンタシスマン","さまようよろい","ゴーレム","デビルアーマー","おどるほうせき","マジカルハット","パペットマン","キラーマシン","やみしばり","たんすミミック","ミステリドール"]
  ];

  function el(tag,className,text){
    var node=document.createElement(tag);
    if(className)node.className=className;
    if(text!=null)node.textContent=text;
    return node;
  }

  async function loadJson(path){
    var response=await fetch("./data/"+path);
    if(!response.ok)throw new Error(path+" の読み込みに失敗しました: "+response.status);
    return response.json();
  }

  function validSkillData(data){
    return data&&Array.isArray(data.common_extra_skills)&&data.monsters&&
      Object.keys(data.monsters).length>0&&
      Object.keys(data.monsters).every(function(group){
        return Array.isArray(data.monsters[group])&&data.monsters[group].every(function(monster){
          return monster&&typeof monster.name==="string"&&Array.isArray(monster.skills)&&monster.skills.length>=4;
        });
      });
  }

  function validMasterData(data){
    return data&&Object.keys(data).length>0&&Object.keys(data).every(function(name){
      var skill=data[name];
      return skill&&Number.isInteger(skill.max_pt)&&Array.isArray(skill.list)&&skill.list.every(function(entry){
        return Number.isInteger(entry.pt)&&typeof entry.effect==="string";
      });
    });
  }

  function validSkillEffects(data){
    return data&&Object.keys(data).length>0&&Object.keys(data).every(function(name){
      return /^【.+】$/.test(name)&&typeof data[name]==="string"&&data[name].length>0;
    });
  }

  function validDefaultNames(data){
    return data&&CATALOG_ORDER.every(function(group){
      return group.every(function(name){
        return typeof data[name]==="string"&&data[name].length>0;
      });
    });
  }

  function validRecommendedBuilds(data){
    return data&&typeof data==="object"&&!Array.isArray(data)&&Object.keys(data).length>0&&
      Object.keys(data).every(function(monster){
        var builds=data[monster];
        return builds&&typeof builds==="object"&&!Array.isArray(builds)&&Object.keys(builds).length>0&&
          Object.keys(builds).every(function(title){
            var build=builds[title];
            return title.length>0&&build&&Array.isArray(build.skills)&&build.skills.length===5&&
              build.skills.every(function(skill){return typeof skill==="string"&&skill.length>0})&&
              Array.isArray(build.points)&&build.points.length===5&&
              build.points.every(function(point){return Number.isInteger(point)&&point>=0});
          });
      });
  }

  function encodeSharedPlan(){
    var plan={
      version:1,
      cards:cards.map(function(card){
        return {
          name:card.name,title:card.title,level:card.level,trans:card.trans,nat:card.nat,
          extra:card.extra,pts:card.pts,fold:card.fold
        };
      })
    };
    var bytes=new TextEncoder().encode(JSON.stringify(plan)),binary="";
    bytes.forEach(function(byte){binary+=String.fromCharCode(byte)});
    return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
  }

  function restoreSharedPlan(){
    var encoded=new URLSearchParams(location.search).get("plan");
    if(!encoded)return;
    try{
      var base64=encoded.replace(/-/g,"+").replace(/_/g,"/");
      base64+="=".repeat((4-base64.length%4)%4);
      var binary=atob(base64),bytes=new Uint8Array(binary.length);
      for(var index=0;index<binary.length;index++)bytes[index]=binary.charCodeAt(index);
      var plan=JSON.parse(new TextDecoder().decode(bytes));
      if(!plan||plan.version!==1||!Array.isArray(plan.cards)||plan.cards.length>100){
        throw new Error("共有データの形式が正しくありません。");
      }
      var restored=plan.cards.map(function(saved){
        if(!saved||!monsterData[saved.name]||typeof saved.title!=="string"||saved.title.length>1000||
          !Number.isInteger(saved.level)||saved.level<1||saved.level>50||
          !Number.isInteger(saved.trans)||saved.trans<0||saved.trans>15||
          ![0,5,10].includes(saved.nat)||!Array.isArray(saved.extra)||saved.extra.length!==2||
          !saved.extra.every(function(name){return typeof name==="string"})||
          (saved.extra[0]&&saved.extra[0]===saved.extra[1])||
          !Array.isArray(saved.pts)||saved.pts.length!==5||
          !saved.pts.every(function(points){return Number.isInteger(points)&&points>=0&&points<=9999})||
          typeof saved.fold!=="boolean"){
          throw new Error("共有データの形式が正しくありません。");
        }
        var card={
          id:++uid,name:saved.name,title:saved.title,level:saved.level,trans:saved.trans,nat:saved.nat,
          extra:saved.extra.slice(),pts:saved.pts.slice(),fold:saved.fold,
          lines:monsterData[saved.name].skills.slice(0,2).concat(monsterData[saved.name].skills[2])
        };
        var available=extraSkills(card.name).filter(function(skill){return card.trans>=skill.trans})
          .map(function(skill){return skill.name});
        if(card.extra.some(function(name){return name&&!available.includes(name)})){
          throw new Error("共有データに現在選択できない追加スキルが含まれています。");
        }
        for(var lineIndex=0;lineIndex<5;lineIndex++){
          var line=getLine(card,lineIndex);
          if((!line||!line.data)&&card.pts[lineIndex]!==0){
            throw new Error("共有データに存在しないスキルへの配分が含まれています。");
          }
          if(line&&line.data&&card.pts[lineIndex]>line.data.max_pt){
            throw new Error("共有データの配分ポイントが上限を超えています。");
          }
        }
        return card;
      });
      cards=restored;
    }catch(error){
      console.error("共有URLを読み込めませんでした。",error);
      window.alert("共有URLの配分を読み込めませんでした。URLが正しいか確認してください。");
    }
  }

  function buildMonsterMap(){
    Object.keys(SKILL_DATA.monsters).forEach(function(group){
      SKILL_DATA.monsters[group].forEach(function(monster){
        monsterData[monster.name]=monster;
      });
    });
  }

  function addCatalogButtons(){
    CATALOG_ORDER.forEach(function(names,index){
      var group=$("#g"+(index+1));
      names.forEach(function(name){
        if(!monsterData[name])throw new Error(name+" が Skill-name.json にありません。");
        var button=el("button",null,name);
        button.type="button";
        button.onclick=function(){add(name)};
        group.appendChild(button);
      });
    });
  }

  function lineTier(base,trans,kind){
    var suffix="";
    if(kind==="primary"){
      suffix=trans>=14?"Ⅲ":trans>=10?"Ⅱ":"";
    }else if(kind==="weaponSkill"){
      suffix=trans>=15?"Ⅲ":trans>=11?"Ⅱ":"";
    }else if(kind==="weaponExtra"&&trans>=12){
      suffix="Ⅱ";
    }else if(kind==="uniqueExtra"&&trans>=13){
      suffix="Ⅱ";
    }
    var name=base+suffix;
    return {name:name,data:SKILL_MASTER[name]||null};
  }

  function displaySkillName(name){
    return name.replace(/（[^）]*）/g,"");
  }

  function extraSkills(name){
    return [
      {name:monsterData[name].skills[2],trans:7,kind:"weaponExtra"},
      {name:monsterData[name].skills[3],trans:8,kind:"uniqueExtra"}
    ].concat(SKILL_DATA.common_extra_skills.map(function(skill){
      return {name:skill.name,trans:skill.trans,kind:"common"};
    }));
  }

  function getLine(card,index){
    var base,kind;
    if(index<2){
      base=card.lines[index];
      kind="primary";
    }else if(index===2){
      var weaponName=card.lines[2].replace(/（[^）]+）/g,"").replace(/の極意$/,"");
      base=weaponName+"スキル";
      if(weaponName==="ブーメラン")base+="（"+card.name+"）";
      kind="weaponSkill";
    }else{
      base=card.extra[index-3];
      if(!base)return null;
      var definition=extraSkills(card.name).find(function(skill){return skill.name===base});
      if(!definition)return null;
      kind=definition.kind;
    }
    var resolved=lineTier(base,card.trans,kind);
    return {name:resolved.name,data:resolved.data};
  }

  function baseSp(level){return Math.round(level*1.38)}
  function sum(values){return values.reduce(function(total,value){return total+value},0)}

  function normalizePoints(card){
    for(var index=0;index<5;index++){
      var line=getLine(card,index);
      if(line&&line.data)card.pts[index]=Math.min(card.pts[index],line.data.max_pt);
    }
  }

  function comparableSkillName(name){
    return name.replace(/（[^）]*）|\([^)]*\)/g,"")
      .replace(/(?:III|II|I|Ⅲ|Ⅱ|Ⅰ)(?=スキル|$)/g,"")
      .replace(/\s/g,"")
      .toLocaleLowerCase("ja");
  }

  function recommendedExtra(card,name){
    var alternatives=name.split(/\s*or\s*/i).map(comparableSkillName);
    var match=extraSkills(card.name).find(function(skill){
      return alternatives.includes(comparableSkillName(skill.name));
    });
    return match?match.name:null;
  }

  function applyRecommendedBuild(card,title,build){
    var next=Object.assign({},card,{
      level:50,
      trans:15,
      nat:10,
      extra:[recommendedExtra(card,build.skills[3]),recommendedExtra(card,build.skills[4])],
      pts:build.points.slice()
    });
    if(!next.extra[0]||!next.extra[1]||next.extra[0]===next.extra[1]){
      throw new Error(title+" の追加スキルを現在のスキルデータに対応付けられません。");
    }
    for(var index=0;index<5;index++){
      var line=getLine(next,index);
      if(!line||!line.data||next.pts[index]>line.data.max_pt){
        throw new Error(title+" の"+(index+1)+"番目の配分がスキルデータの範囲外です。");
      }
    }
    card.level=next.level;
    card.trans=next.trans;
    card.nat=next.nat;
    card.extra=next.extra;
    card.pts=next.pts;
    render();
  }

  function bonus(card){return {b1:card.trans*10,b2:card.nat}}

  function renderSkillLine(card,index){
    var line=getLine(card,index);
    var node=el("div","line");
    node.dataset.lineIndex=String(index);
    node.appendChild(el("h3",null,displaySkillName(line.name)+": "+card.pts[index]));

    var stepper=el("div","st");
    var input=el("input");
    input.type="number";
    input.min="0";
    input.max=line.data?String(line.data.max_pt):"0";
    input.setAttribute("aria-label",displaySkillName(line.name)+"のポイント");
    input.disabled=!line.data;
    input.oninput=function(){setLinePoints(card,index,input.value)};
    input.onkeydown=function(event){
      if(["ArrowUp","ArrowDown","PageUp","PageDown"].includes(event.key)){
        event.preventDefault();
        var amount=event.key==="PageUp"||event.key==="PageDown"?10:1;
        var direction=event.key==="ArrowUp"||event.key==="PageUp"?1:-1;
        setLinePoints(card,index,card.pts[index]+amount*direction);
      }
    };
    var reset=el("button","rs","↺");
    reset.type="button";
    reset.title="リセット";
    reset.disabled=!line.data;
    reset.onclick=function(){setLinePoints(card,index,0)};
    stepper.append(input,reset);
    node.appendChild(stepper);

    var rows=el("ul","rows");
    if(line.data){
      line.data.list.forEach(function(entry){
        var row=el("li");
        row.dataset.pt=String(entry.pt);
        var point=el("b",null,String(entry.pt));
        var effect=el("span",null,entry.effect);
        var skillNames=entry.effect.match(/【[^】]+】/g)||[];
        var descriptions=skillNames.map(function(name){return SKILL_EFFECTS[name]}).filter(Boolean);
        effect.title=descriptions.length?descriptions.join("\n"):entry.effect;
        row.append(point,effect);
        row.onclick=function(){setLinePoints(card,index,entry.pt)};
        rows.appendChild(row);
      });
    }else{
      var warning=el("li","data-missing",displaySkillName(line.name)+" のスキルデータが Skills-master.json にありません");
      warning.setAttribute("role","alert");
      rows.appendChild(warning);
    }
    node.appendChild(rows);
    return node;
  }

  function setLinePoints(card,index,value){
    var line=getLine(card,index);
    if(!line||!line.data)return;
    card.pts[index]=Math.max(0,Math.min(line.data.max_pt,Math.floor(Number(value)||0)));
    refresh(card);
  }

  function refresh(card){
    var node=document.querySelector('.card[data-id="'+card.id+'"]');
    if(!node)return;
    var extra=bonus(card),base=baseSp(card.level),total=base+extra.b1+extra.b2;
    var used=sum(card.pts);
    node.querySelector(".ttl").textContent=card.name;
    node.querySelector(".sp").textContent=(total-used)+" / "+total;
    node.querySelector(".sp").style.color=(total-used)<0?"var(--c-notice)":"";
    node.querySelectorAll(".line[data-line-index]").forEach(function(lineNode){
      var index=Number(lineNode.dataset.lineIndex),line=getLine(card,index);
      lineNode.querySelector("h3").textContent=displaySkillName(line.name)+": "+card.pts[index];
      var input=lineNode.querySelector("input");
      input.value=card.pts[index];
      input.max=line.data?line.data.max_pt:0;
      input.disabled=!line.data;
      lineNode.querySelector(".rs").disabled=!line.data;
      lineNode.querySelectorAll("li[data-pt]").forEach(function(row){
        row.classList.toggle("on",Number(row.dataset.pt)<=card.pts[index]);
      });
    });
    var shareUrl=new URL(location.href);
    shareUrl.searchParams.set("plan",encodeSharedPlan());
    $("#u").value=shareUrl.toString();
  }

  async function copyUrl(){
    var input=$("#u"),button=$("#copy-url");
    if(!input.value){
      window.alert("コピーする保存用URLがありません。");
      return;
    }
    var copied=false;
    if(navigator.clipboard&&window.isSecureContext){
      try{
        await navigator.clipboard.writeText(input.value);
        copied=true;
      }catch(error){
        console.error("クリップボードAPIで保存用URLをコピーできませんでした。",error);
      }
    }
    if(!copied){
      input.focus();
      input.select();
      try{
        copied=document.execCommand("copy");
      }catch(error){
        console.error("従来方式で保存用URLをコピーできませんでした。",error);
      }
    }
    if(copied){
      button.textContent="コピーしました";
      window.setTimeout(function(){button.textContent="コピー"},1500);
    }else{
      input.focus();
      input.select();
      window.alert("保存用URLをコピーできませんでした。URLを選択したので、手動でコピーしてください。");
    }
  }

  function render(){
    var box=$("#cards");
    box.replaceChildren();
    $("#empty").style.display=cards.length?"none":"flex";
    if(!cards.length)$("#u").value="";
    cards.forEach(function(card,index){
      var node=el("div","panel card"+(card.fold?" fold":""));
      node.dataset.id=card.id;
      var header=el("div","card-h");
      header.appendChild(el("span","ttl",""));

      var familiarity=el("label");
      familiarity.appendChild(document.createTextNode("なつき度: "));
      var familiaritySelect=el("select","nat");
      [["200未満",0],["200 (+5)",5],["300 (+10)",10]].forEach(function(option){
        familiaritySelect.appendChild(new Option(option[0],option[1]));
      });
      familiaritySelect.value=card.nat;
      familiaritySelect.onchange=function(){card.nat=Number(familiaritySelect.value);refresh(card)};
      familiarity.appendChild(familiaritySelect);
      header.appendChild(familiarity);

      [0,1].forEach(function(slot){
        var label=el("label",null,"追加スキル"+(slot+1)+": ");
        var select=el("select");
        select.appendChild(new Option("",""));
        extraSkills(card.name).filter(function(skill){return card.trans>=skill.trans}).forEach(function(skill){
          var option=lineTier(skill.name,card.trans,skill.kind);
          select.appendChild(new Option(displaySkillName(option.name),skill.name));
        });
        select.value=card.extra[slot];
        select.onchange=function(){
          card.extra[slot]=select.value;
          card.pts[3+slot]=0;
          if(select.value&&card.extra[1-slot]===select.value){
            card.extra[1-slot]="";
            card.pts[4-slot]=0;
          }
          render();
        };
        label.appendChild(select);
        header.appendChild(label);
      });

      var nameLabel=el("label");
      nameLabel.appendChild(document.createTextNode("名前: "));
      var nameInput=el("input","nm");
      nameInput.type="text";
      nameInput.value=card.title;
      nameInput.oninput=function(){card.title=nameInput.value;refresh(card)};
      nameLabel.appendChild(nameInput);
      header.appendChild(nameLabel);
      [
        ["fold",card.fold?"▶":"⤒",card.fold?"ひろげる":"たたむ",function(){card.fold=!card.fold;render()}],
        ["dn","▼","下へ",function(){move(index,1)}],
        ["up","▲","上へ",function(){move(index,-1)}],
        ["del","✖","削除",function(){cards.splice(index,1);render()}]
      ].forEach(function(button){
        var nodeButton=el("button","ib",button[1]);
        nodeButton.type="button";
        nodeButton.title=button[2];
        nodeButton.setAttribute("aria-label",button[2]);
        nodeButton.onclick=button[3];
        header.appendChild(nodeButton);
      });
      node.appendChild(header);

      var body=el("div","body"),left=el("div","left");
      var levelLabel=el("label",null,"レベル ");
      var levelSelect=el("select","lv");
      for(var level=1;level<=50;level++){
        levelSelect.appendChild(new Option(level+" ("+baseSp(level)+")",level));
      }
      levelSelect.value=card.level;
      levelSelect.onchange=function(){card.level=Number(levelSelect.value);refresh(card)};
      levelLabel.appendChild(levelSelect);
      left.appendChild(levelLabel);
      left.appendChild(el("div",null,"残りスキルポイント:"));
      left.appendChild(el("div","sp",""));

      var transLabel=el("label");
      transLabel.appendChild(document.createTextNode("転生回数 "));
      var transInput=el("input");
      transInput.type="number";
      transInput.min="0";
      transInput.max="15";
      transInput.value=card.trans;
      transInput.onchange=function(){
        card.trans=Math.max(0,Math.min(15,Math.floor(Number(transInput.value)||0)));
        var available=extraSkills(card.name).filter(function(skill){
          return card.trans>=skill.trans;
        }).map(function(skill){return skill.name});
        for(var slot=0;slot<2;slot++){
          if(card.extra[slot]&&!available.includes(card.extra[slot])){
            card.extra[slot]="";
            card.pts[3+slot]=0;
          }
        }
        normalizePoints(card);
        render();
      };
      transLabel.appendChild(transInput);
      left.appendChild(transLabel);
      var recommendations=RECOMMENDED_BUILDS[card.name]||{};
      if(Object.keys(recommendations).length){
        left.appendChild(el("div","rec-label","★ オススメ設定"));
        var recommendationButtons=el("div","rec-list");
        Object.keys(recommendations).forEach(function(title){
          var build=recommendations[title];
          var recommendButton=el("button","rec",title);
          recommendButton.type="button";
          recommendButton.title=title+"（Lv50・なつき度300・転生15回）";
          recommendButton.setAttribute("aria-label","オススメ設定: "+title);
          recommendButton.onclick=function(){
            try{
              applyRecommendedBuild(card,title,build);
            }catch(error){
              console.error("オススメ設定を適用できませんでした。",error);
              window.alert("オススメ設定を適用できませんでした。\n"+error.message);
            }
          };
          recommendationButtons.appendChild(recommendButton);
        });
        left.appendChild(recommendationButtons);
      }
      body.appendChild(left);

      var skills=el("div","skills");
      for(var skillIndex=0;skillIndex<5;skillIndex++){
        var line=getLine(card,skillIndex);
        if(!line){
          skills.appendChild(el("div","line ph","追加スキル"+(skillIndex-2)+"を選択"));
        }else{
          skills.appendChild(renderSkillLine(card,skillIndex));
        }
      }
      body.appendChild(skills);
      node.appendChild(body);
      box.appendChild(node);
      refresh(card);
    });
  }

  function add(name){
    cards.unshift({
      id:++uid,name:name,title:DEFAULT_NAMES[name],level:50,trans:15,nat:10,
      extra:[monsterData[name].skills[2],monsterData[name].skills[3]],pts:[0,0,0,0,0],fold:false,
      lines:monsterData[name].skills.slice(0,2).concat(monsterData[name].skills[2])
    });
    render();
    var input=document.querySelector('.card[data-id="'+uid+'"] .nm');
    if(input){input.focus();input.select()}
  }

  function move(index,direction){
    var next=index+direction;
    if(next<0||next>=cards.length)return;
    var current=cards[index];
    cards[index]=cards[next];
    cards[next]=current;
    render();
  }

  async function initialize(){
    var loaded=await Promise.all([
      loadJson("Skill-name.json"),
      loadJson("Skills-master.json"),
      loadJson("skill-effects.json"),
      loadJson("Monster-default-names.json"),
      loadJson("Recommended-builds.json")
    ]);
    SKILL_DATA=loaded[0];
    SKILL_MASTER=loaded[1];
    SKILL_EFFECTS=loaded[2];
    DEFAULT_NAMES=loaded[3];
    RECOMMENDED_BUILDS=loaded[4];
    if(!validSkillData(SKILL_DATA))throw new Error("Skill-name.json の形式が正しくありません。");
    if(!validMasterData(SKILL_MASTER))throw new Error("Skills-master.json の形式が正しくありません。");
    if(!validSkillEffects(SKILL_EFFECTS))throw new Error("skill-effects.json の形式が正しくありません。");
    if(!validDefaultNames(DEFAULT_NAMES))throw new Error("Monster-default-names.json の形式が正しくないか、モンスター名が不足しています。");
    if(!validRecommendedBuilds(RECOMMENDED_BUILDS))throw new Error("Recommended-builds.json の形式が正しくありません。");
    buildMonsterMap();
    restoreSharedPlan();
    addCatalogButtons();

    var bulkLevel=$("#bl");
    for(var level=1;level<=50;level++){
      bulkLevel.appendChild(new Option(level,level,level===50,level===50));
    }
    $("#bs").onclick=function(){
      cards.forEach(function(card){card.level=Number(bulkLevel.value)});
      render();
    };
    $("#foldAll").onclick=function(){cards.forEach(function(card){card.fold=true});render()};
    $("#openAll").onclick=function(){cards.forEach(function(card){card.fold=false});render()};
    $("#copy-url").onclick=copyUrl;
    render();
  }

  function showLoadError(error){
    console.error("スキルデータを読み込めませんでした。",error);
    var message=el("div","panel empty");
    message.setAttribute("role","alert");
    if(location.protocol==="file:"){
      message.appendChild(el("p",null,"このHTMLを直接開いているため、ブラウザーの制限でスキルデータを読み込めません。"));
      message.appendChild(el("p",null,"HTMLとJSONファイルを同じフォルダーに置いたまま、ローカルWebサーバー経由で開いてください。Windowsでは、そのフォルダーで「py -m http.server 8000」を実行し、表示されたサーバーのページからこのHTMLを開きます。"));
    }else{
      message.appendChild(el("p",null,"スキルデータを読み込めませんでした。dataフォルダーに Skill-name.json、Skills-master.json、skill-effects.json、Monster-default-names.json、Recommended-builds.json があるか確認してください。"));
      message.appendChild(el("p",null,"詳細: "+(error&&error.message?error.message:String(error))));
    }
    $("#cards").replaceChildren(message);
    $("#empty").style.display="none";
  }

  initialize().catch(showLoadError);
})();
