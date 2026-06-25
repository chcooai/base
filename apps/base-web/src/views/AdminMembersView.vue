<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { useAdminStore } from '../stores/admin';

const store = useAdminStore();
const page = ref(1);
const pageSize = ref(20);
const q = ref('');

async function refresh() { await store.load(page.value, pageSize.value, q.value || undefined); }
onMounted(refresh);

function onSearch() { page.value = 1; refresh(); }
function onPage(p: number) { page.value = p; refresh(); }

const createDlg = reactive({ visible: false, email: '', password: '', role: 'user' as 'user' | 'admin' });
async function submitCreate() {
  try {
    await store.create(createDlg.email, createDlg.password, createDlg.role);
    ElMessage.success('已创建');
    createDlg.visible = false; createDlg.email = ''; createDlg.password = '';
    await refresh();
  } catch (e: any) { ElMessage.error(e?.response?.data?.message ?? '创建失败'); }
}

const pwdDlg = reactive({ visible: false, id: '', password: '' });
function openPwd(id: string) { pwdDlg.id = id; pwdDlg.password = ''; pwdDlg.visible = true; }
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
</script>

<template>
  <div class="admin-members">
    <div class="toolbar">
      <el-input v-model="q" placeholder="按邮箱搜索" clearable style="width: 240px" @keyup.enter="onSearch" />
      <el-button type="primary" @click="onSearch">搜索</el-button>
      <el-button @click="createDlg.visible = true">新建成员</el-button>
    </div>

    <el-table :data="store.members" style="width: 100%">
      <el-table-column prop="email" label="邮箱" />
      <el-table-column prop="status" label="状态" width="100" />
      <el-table-column prop="role" label="角色" width="100" />
      <el-table-column prop="createdAt" label="注册时间" width="200" />
      <el-table-column label="操作" width="320">
        <template #default="{ row }">
          <el-button size="small" @click="toggleStatus(row)">{{ row.status === 'active' ? '禁用' : '启用' }}</el-button>
          <el-button size="small" @click="openPwd(row.id)">重置密码</el-button>
          <el-button size="small" @click="toggleRole(row)">{{ row.role === 'admin' ? '取消管理员' : '设为管理员' }}</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      :current-page="page" :page-size="pageSize" :total="store.total"
      layout="prev, pager, next" @current-change="onPage" />

    <el-dialog v-model="createDlg.visible" title="新建成员" width="420px">
      <el-input v-model="createDlg.email" placeholder="邮箱" style="margin-bottom: 12px" />
      <el-input v-model="createDlg.password" type="password" placeholder="初始密码(≥8位)" style="margin-bottom: 12px" />
      <el-button :type="createDlg.role === 'admin' ? 'primary' : 'default'" @click="createDlg.role = createDlg.role === 'admin' ? 'user' : 'admin'">
        {{ createDlg.role === 'admin' ? '管理员' : '普通成员' }}
      </el-button>
      <template #footer>
        <el-button @click="createDlg.visible = false">取消</el-button>
        <el-button type="primary" @click="submitCreate">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="pwdDlg.visible" title="重置密码" width="420px">
      <el-input v-model="pwdDlg.password" type="password" placeholder="新密码(≥8位)" />
      <template #footer>
        <el-button @click="pwdDlg.visible = false">取消</el-button>
        <el-button type="primary" @click="submitPwd">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>
