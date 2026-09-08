import { PARTS, TIMELINE, CERT } from '../data/content.js';

export const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export function placeholder() {
  return `<p class="placeholder">검안대 위에 시신이 놓여 있다.<br>
사망자는 유럽의 「긴 평화」. 1871년부터 1914년까지 43년간, 강대국 사이에 큰 전쟁이 한 번도 없었다.<br><br>
가슴에 총상 하나. 그 밖에 눈에 띄는 손상은 없다.<br><br>
시신을 드래그해 돌려 보고, 부위를 클릭해 검안을 시작하십시오.</p>`;
}

/** 확보한 장기 소견 목록 */
export function ledger(S) {
  const keys = ['vessel', 'bone', 'nerve'];
  const rows = keys.map((k) => {
    const p = PARTS[k], got = S.found.has(k);
    const summary = got ? p.concl.replace(/<\/?b>/g, '').replace(/^.*— /, '') : '미검사';
    return `<li class="${got ? 'got' : ''}"><span class="mk">${got ? '■' : '□'}</span><span>${p.idx} ${p.n} — ${summary}</span></li>`;
  }).join('');
  const n = keys.filter((k) => S.found.has(k)).length;
  return `<div class="ledger"><h3>확보한 장기 소견 ${n} / 3</h3><ol>${rows}</ol></div>`;
}

export function part(key, S) {
  const p = PARTS[key];
  let h = `<div class="finding"><span class="charge">담당 ${p.who}</span>`;
  h += p.body.map((b) => (typeof b === 'string' ? `<p>${b}</p>` : `<p class="q">${b.q}</p>`)).join('');
  h += `<div class="verdict-line">${p.concl}</div>`;
  if (key === 'wound' && S.stage === 0) {
    h += `<div class="stamp-wrap"><div class="stamp"><span class="s1">잠 정 판 정</span><span class="s2">外因死</span></div></div>`;
  }
  h += `</div>`;
  if (S.stage >= 1) h += ledger(S);
  return { title: p.n, sub: p.en, html: h };
}

export function timeline() {
  const rows = TIMELINE.map((r, i) => `<li data-i="${i}"><span class="d">${r[0]}</span><span class="ev">${r[1]}${r[3] ? `<span class="sys">${r[3]}</span>` : ''}<span class="bd">몸에서는 — ${r[2]}</span></span></li>`).join('');
  return {
    title: '사망 직전 37일',
    sub: 'TERMINAL 37 DAYS',
    html: `<div class="finding"><span class="charge">담당 D</span>
    <p>세 계통의 병이 어떻게 한꺼번에 작동했는지를 날짜별로 본다. 오른쪽 표기는 그 순간 작동한 계통이다.</p></div>
    <ul class="tl" id="tl">${rows}</ul>
    <div class="verdict-line" id="tlEnd" style="display:none">총상에서 사망까지 단 <b>37일</b>. 이 속도 자체가 결정적 증거다. 건강한 몸은 이렇게 빨리 죽지 않는다.</div>`
  };
}

export function cert() {
  const rows = CERT.map((c, i) => `<tr data-i="${i}"><th>${c.k}<div class="layer">${c.layer}</div></th>
    <td><select data-i="${i}"><option value="">— 선택 —</option>${c.opts.map((o) => `<option>${esc(o)}</option>`).join('')}</select></td></tr>`).join('');
  return {
    title: '사인 판정',
    sub: 'CAUSE OF DEATH',
    html: `<div class="finding"><span class="charge">담당 D</span>
    <p>사망진단서는 “직접적인 사인 ← 그 원인 ← 근본 원인” 순서로 거슬러 올라간다. 네 칸을 채우십시오.</p></div>
    <table class="cert"><tbody>${rows}</tbody></table>
    <div id="final"></div>
    <div class="refs">에릭 홉스봄, 『제국의 시대(1875–1914)』 12장 「혁명을 향하여」 · 13장 「평화에서 전쟁으로」<br>
    노먼 에인절, 『거대한 환상』(1910)<br>※ 역사적 서술은 위 문헌과 교과서적으로 확립된 사실에 근거하며, 부검 보고서 형식과 신체 비유는 이해를 돕기 위해 구성한 것이다.</div>`
  };
}

export function finalVerdict() {
  return `<div class="stamp-wrap" style="height:130px">
      <div class="stamp corrected"><span class="s1">잠 정 판 정</span><span class="s2">外因死</span></div>
      <div class="stamp over"><span class="s1">최 종 판 정</span><span class="s2">病死</span></div></div>
    <div class="verdict-line">형식상으로는 외상에 의한 사망으로 보이지만, 실제로는 오래된 병에 의한 <b>병사(病死)</b>에 가깝다. 총알은 방아쇠였을 뿐, 죽음은 이미 예정되어 있었다.</div>
    <div class="finding" style="margin-top:20px">
      <p>가장 놀라운 사실은 기업가들 대부분이 전쟁을 원하지 않았다는 것이다. 그런데도 전쟁은 일어났다. 제국주의 경쟁과 강대국 정치, 민족주의가 경제와는 별개의 논리로 굴러갔기 때문이다.</p>
      <p class="q">'아름다운 시대'는 파국이 없었던 시대가 아니라 파국이 잠복해 있던 시대였다. 질서란 갈등이 사라진 상태가 아니라 갈등을 어떤 그릇에 담아 둔 상태다. 그 그릇이 감당하지 못하면, 그릇 자체가 무기가 된다.</p></div>`;
}
