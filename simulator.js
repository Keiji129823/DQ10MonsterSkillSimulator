(async function(){
  "use strict";

  var $=function(selector){return document.querySelector(selector)};
  var cards=[],uid=0,SKILL_DATA,SKILL_MASTER,monsterData={};
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
    var response=await fetch("./"+path);
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
        if(!monsterData[name])throw new Error(name+" が SkillName.json にありません。");
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
    }else if(kind==="common"){
      if(trans>=14&&SKILL_MASTER[base+"Ⅲ"])suffix="Ⅲ";
      else if(trans>=10&&SKILL_MASTER[base+"Ⅱ"])suffix="Ⅱ";
    }
    var name=base+suffix;
    return {name:name,data:SKILL_MASTER[name]||null};
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

  function recommend(card){
    var extra=bonus(card),left=baseSp(card.level)+extra.b1+extra.b2;
    var points=[0,0,0,0,0],changed=true;
    while(changed){
      changed=false;
      for(var index=0;index<5;index++){
        var line=getLine(card,index);
        if(!line||!line.data)continue;
        var next=line.data.list.map(function(entry){return entry.pt}).find(function(point){
          return point>points[index];
        });
        if(next!=null&&next-points[index]<=left){
          left-=next-points[index];
          points[index]=next;
          changed=true;
        }
      }
    }
    card.pts=points;
    refresh(card);
  }

  function bonus(card){return {b1:card.trans*10,b2:card.nat}}

  function renderSkillLine(card,index){
    var line=getLine(card,index);
    var node=el("div","line");
    node.dataset.lineIndex=String(index);
    node.appendChild(el("h3",null,line.name+": "+card.pts[index]));

    var stepper=el("div","st");
    var input=el("input");
    input.type="number";
    input.min="0";
    input.max=line.data?String(line.data.max_pt):"0";
    input.setAttribute("aria-label",line.name+"のポイント");
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
        effect.title=entry.effect;
        row.append(point,effect);
        row.onclick=function(){setLinePoints(card,index,entry.pt)};
        rows.appendChild(row);
      });
    }else{
      var warning=el("li","data-missing",line.name+" のスキルデータが skills-master.json にありません");
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
    node.querySelector(".ttl").innerHTML=esc(card.title)+" Lv"+card.level+
      (card.trans?" <small>+ "+card.trans+"</small>":"");
    node.querySelector(".sp").textContent=(total-used)+" / "+total;
    node.querySelector(".sp").style.color=(total-used)<0?"var(--c-notice)":"";
    node.querySelectorAll(".line[data-line-index]").forEach(function(lineNode){
      var index=Number(lineNode.dataset.lineIndex),line=getLine(card,index);
      lineNode.querySelector("h3").textContent=line.name+": "+card.pts[index];
      var input=lineNode.querySelector("input");
      input.value=card.pts[index];
      input.max=line.data?line.data.max_pt:0;
      input.disabled=!line.data;
      lineNode.querySelector(".rs").disabled=!line.data;
      lineNode.querySelectorAll("li[data-pt]").forEach(function(row){
        row.classList.toggle("on",Number(row.dataset.pt)<=card.pts[index]);
      });
    });
    $("#u").value="https://example.invalid/monster?s="+
      btoa(unescape(encodeURIComponent(cards.map(function(entry){
        return entry.name+entry.level+"."+entry.pts.join("-");
      }).join("|")))).slice(0,24);
  }

  function esc(text){
    return text.replace(/[&<>"]/g,function(character){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[character];
    });
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
          select.appendChild(new Option(option.name,skill.name));
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
        ["fold",card.fold?"▼":"⤒","たたむ/ひろげる",function(){card.fold=!card.fold;render()}],
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
      var recommendButton=el("button","rec","★ オススメ設定");
      recommendButton.type="button";
      recommendButton.title="残りポイントを自動で割り振ります";
      recommendButton.onclick=function(){recommend(card)};
      left.appendChild(recommendButton);
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
    cards.push({
      id:++uid,name:name,title:name,level:50,trans:15,nat:10,
      extra:["",""],pts:[0,0,0,0,0],fold:false,
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
    var loaded=await Promise.all([loadJson("SkillName.json"),loadJson("skills-master.json")]);
    SKILL_DATA=loaded[0];
    SKILL_MASTER=loaded[1];
    if(!validSkillData(SKILL_DATA))throw new Error("SkillName.json の形式が正しくありません。");
    if(!validMasterData(SKILL_MASTER))throw new Error("skills-master.json の形式が正しくありません。");
    buildMonsterMap();
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
      message.appendChild(el("p",null,"スキルデータを読み込めませんでした。SkillName.json と skills-master.json がHTMLと同じフォルダーにあるか確認してください。"));
      message.appendChild(el("p",null,"詳細: "+(error&&error.message?error.message:String(error))));
    }
    $("#cards").replaceChildren(message);
    $("#empty").style.display="none";
  }

  initialize().catch(showLoadError);
})();
