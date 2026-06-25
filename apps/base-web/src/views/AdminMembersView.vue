<script setup lang="ts">
import QkMark from "../components/QkMark.vue";
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { useRouter } from 'vue-router';
import { useAdminStore } from '../stores/admin';

const store = useAdminStore();
const router = useRouter();
const page = ref(1);
const pageSize = ref(20);
const q = ref('');
const loading = ref(false);

async function refresh() {
  loading.value = true;
  try { await store.load(page.value, pageSize.value, q.value || undefined); }
  catch (e: any) { ElMessage.error(e?.response?.data?.message ?? '加载失败'); }
  finally { loading.value = false; }
}
onMounted(refresh);

function onSearch() { page.value = 1; refresh(); }
function onPage(p: number) { page.value = p; refresh(); }

const createDlg = reactive({ visible: false, email: '', password: '', role: 'user' as 'user' | 'admin' });
async function submitCreate() {
  try {
    await store.create(createDlg.email, createDlg.password, createDlg.role);
    ElMessage.success('成员已创建');
    createDlg.visible = false; createDlg.email = ''; createDlg.password = ''; createDlg.role = 'user';
    await refresh();
  } catch (e: any) { ElMessage.error(e?.response?.data?.message ?? '创建失败'); }
}

const pwdDlg = reactive({ visible: false, id: '', email: '', password: '' });
function openPwd(row: any) { pwdDlg.id = row.id; pwdDlg.email = row.email; pwdDlg.password = ''; pwdDlg.visible = true; }
async function submitPwd() {
  try { await store.resetPassword(pwdDlg.id, pwdDlg.password); ElMessage.success('密码已重置'); pwdDlg.visible = false; }
  catch (e: any) { ElMessage.error(e?.response?.data?.message ?? '操作失败'); }
}

async function toggleStatus(row: any) {
  const next = row.status === 'active' ? 'disabled' : 'active';
  try { await store.setStatus(row.id, next); await refresh(); }
  catch (e: any) { ElMessage.error(e?.response?.data?.message ?? '操作失败'); }
}
async function toggleRole(row: any) {
  const next = row.role === 'admin' ? 'user' : 'admin';
  try { await store.setRole(row.id, next); await refresh(); }
  catch (e: any) { ElMessage.error(e?.response?.data?.message ?? '操作失败'); }
}
function fmtDate(s: string) { return s ? String(s).slice(0, 10) : '—'; }
</script>

<template>
  <div class="qk-admin">
    <header class="qk-admin__bar">
      <div class="qk-brand"><QkMark :size="26" /><span class="qk-brand__name">启蔻</span><span class="qk-brand__ai">AI</span></div>
      <el-button text @click="router.push('/welcome')">返回</el-button>
    </header>

    <main class="qk-admin__main">
      <div class="qk-admin__head">
        <h1 class="qk-admin__h1">成员管理</h1>
        <p class="qk-admin__lead">查看与管理平台所有成员账号。</p>
      </div>

      <div class="qk-card">
        <div class="qk-toolbar">
          <el-input
            v-model="q" placeholder="按邮箱搜索" clearable style="width: 260px"
            @keyup.enter="onSearch" @clear="onSearch"
          />
          <el-button @click="onSearch">搜索</el-button>
          <span class="qk-toolbar__spacer" />
          <el-button type="primary" @click="createDlg.visible = true">新建成员</el-button>
        </div>

        <el-table :data="store.members" v-loading="loading" style="width: 100%" empty-text="还没有成员">
          <el-table-column prop="email" label="邮箱" min-width="220" />
          <el-table-column label="状态" width="110">
            <template #default="{ row }">
              <span class="qk-tag" :class="row.status === 'active' ? 'qk-tag--active' : 'qk-tag--disabled'">
                {{ row.status === 'active' ? '正常' : '已禁用' }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="角色" width="110">
            <template #default="{ row }">
              <span class="qk-tag" :class="row.role === 'admin' ? 'qk-tag--admin' : 'qk-tag--user'">
                {{ row.role === 'admin' ? '管理员' : '成员' }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="注册时间" width="140">
            <template #default="{ row }">{{ fmtDate(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="300" align="right">
            <template #default="{ row }">
              <el-button size="small" text @click="toggleStatus(row)">{{ row.status === 'active' ? '禁用' : '启用' }}</el-button>
              <el-button size="small" text @click="openPwd(row)">重置密码</el-button>
              <el-button size="small" text @click="toggleRole(row)">{{ row.role === 'admin' ? '取消管理员' : '设为管理员' }}</el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="qk-pager">
          <el-pagination
            :current-page="page" :page-size="pageSize" :total="store.total"
            layout="prev, pager, next" @current-change="onPage"
          />
        </div>
      </div>
    </main>

    <el-dialog v-model="createDlg.visible" title="新建成员" width="420px">
      <div class="qk-field">
        <label for="c-email">邮箱</label>
        <el-input id="c-email" v-model="createDlg.email" size="large" placeholder="you@example.com" />
      </div>
      <div class="qk-field">
        <label for="c-pwd">初始密码</label>
        <el-input id="c-pwd" v-model="createDlg.password" type="password" size="large" show-password placeholder="至少 8 位" />
      </div>
      <div class="qk-field">
        <label>角色</label>
        <el-segmented v-model="createDlg.role" :options="[{label:'成员',value:'user'},{label:'管理员',value:'admin'}]" />
      </div>
      <template #footer>
        <el-button @click="createDlg.visible = false">取消</el-button>
        <el-button type="primary" @click="submitCreate">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="pwdDlg.visible" title="重置密码" width="420px">
      <p class="qk-auth__sub" style="margin-bottom: 16px">为 {{ pwdDlg.email }} 设置新密码</p>
      <div class="qk-field">
        <label for="r-pwd">新密码</label>
        <el-input id="r-pwd" v-model="pwdDlg.password" type="password" size="large" show-password placeholder="至少 8 位" />
      </div>
      <template #footer>
        <el-button @click="pwdDlg.visible = false">取消</el-button>
        <el-button type="primary" @click="submitPwd">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>
