const API='https://api.github.com';
const API_VERSION='2026-03-10';

export async function publishToGithubPages({token,owner,repo,html,description='Created with AppGPT'}){
  if(!html)throw new Error('There is no generated index.html to publish.');
  return publishFilesToGithubPages({token,owner,repo,description,files:{'index.html':html}});
}

export async function publishFilesToGithubPages({token,owner,repo,files,description='Created with AppGPT'}){
  if(!token)throw new Error('Add a GitHub token first.');
  if(!owner||!repo)throw new Error('Enter a GitHub owner and repository name.');
  const entries=Object.entries(files||{}).filter(([path,content])=>path&&typeof content==='string');
  if(!entries.length)throw new Error('There are no files to publish.');

  const user=await gh('/user',{token});
  const normalizedOwner=owner.trim();
  const normalizedRepo=sanitizeRepo(repo);
  let repository=await gh(`/repos/${encodeURIComponent(normalizedOwner)}/${encodeURIComponent(normalizedRepo)}`,{token,allow404:true});
  if(!repository){
    if(user.login.toLowerCase()!==normalizedOwner.toLowerCase())throw new Error(`The repository does not exist. AppGPT can auto-create repositories only under the signed-in GitHub account (${user.login}).`);
    repository=await gh('/user/repos',{token,method:'POST',body:{name:normalizedRepo,description,private:false,auto_init:true}});
  }

  const defaultBranch=repository.default_branch||'main';
  const published=[];
  for(const [path,content] of entries){
    const safePath=normalizePath(path);
    const apiPath=encodePath(safePath);
    const existing=await gh(`/repos/${encodeURIComponent(normalizedOwner)}/${encodeURIComponent(normalizedRepo)}/contents/${apiPath}?ref=${encodeURIComponent(defaultBranch)}`,{token,allow404:true});
    const body={
      message:existing?`Update ${safePath} from AppGPT`:`Publish ${safePath} from AppGPT`,
      content:utf8Base64(content),
      branch:defaultBranch,
      ...(existing?.sha?{sha:existing.sha}:{})
    };
    const result=await gh(`/repos/${encodeURIComponent(normalizedOwner)}/${encodeURIComponent(normalizedRepo)}/contents/${apiPath}`,{token,method:'PUT',body});
    published.push({path:safePath,commitUrl:result?.commit?.html_url||null,sha:result?.content?.sha||null});
  }

  const pages=await ensurePages({token,owner:normalizedOwner,repo:normalizedRepo,branch:defaultBranch});
  return{
    repoUrl:repository.html_url||`https://github.com/${normalizedOwner}/${normalizedRepo}`,
    pagesUrl:pages?.html_url||`https://${normalizedOwner.toLowerCase()}.github.io/${normalizedRepo}/`,
    commitUrl:published[0]?.commitUrl||null,
    files:published,
    owner:normalizedOwner,
    repo:normalizedRepo,
    branch:defaultBranch
  };
}

export async function verifyGithubToken(token){
  if(!token)throw new Error('Paste a GitHub token first.');
  const user=await gh('/user',{token});
  return{login:user.login,avatarUrl:user.avatar_url};
}

async function ensurePages({token,owner,repo,branch}){
  let pages=await gh(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pages`,{token,allow404:true});
  if(!pages){
    try{
      pages=await gh(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pages`,{token,method:'POST',body:{source:{branch,path:'/'}}});
    }catch(error){
      throw new Error(`Files were published, but GitHub Pages could not be enabled automatically: ${error.message}`);
    }
  }else if(pages?.source?.branch!==branch||pages?.source?.path!=='/'){
    try{pages=await gh(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pages`,{token,method:'PUT',body:{source:{branch,path:'/'}}});}catch{}
  }
  return pages;
}

async function gh(path,{token,method='GET',body,allow404=false}={}){
  const response=await fetch(`${API}${path}`,{
    method,
    headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':API_VERSION,...body?{'Content-Type':'application/json'}:{}},
    ...body?{body:JSON.stringify(body)}:{}
  });
  if(allow404&&response.status===404)return null;
  const text=await response.text();
  let data=null;
  try{data=text?JSON.parse(text):{};}catch{data={message:text};}
  if(!response.ok)throw new Error(data?.message||`GitHub request failed (${response.status})`);
  return data;
}

function sanitizeRepo(value){
  const cleaned=String(value||'').trim().replace(/[^A-Za-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'');
  if(!cleaned)throw new Error('Enter a valid repository name.');
  return cleaned.slice(0,100);
}

function normalizePath(value){
  const parts=String(value||'').replace(/\\/g,'/').split('/').filter(Boolean).filter(x=>x!=='.'&&x!=='..');
  if(!parts.length)throw new Error('Enter a valid file path.');
  return parts.join('/');
}

function encodePath(path){return path.split('/').map(encodeURIComponent).join('/');}
function utf8Base64(text){
  const bytes=new TextEncoder().encode(text);let binary='';const size=0x8000;
  for(let i=0;i<bytes.length;i+=size)binary+=String.fromCharCode(...bytes.subarray(i,i+size));
  return btoa(binary);
}
