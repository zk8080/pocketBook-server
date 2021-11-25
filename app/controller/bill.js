'use strict';

const moment = require('moment');
const Controller = require('egg').Controller;

class BillController extends Controller {
  async add() {
    const { ctx, app } = this;
    // 请求参数
    const { amount, type_id, type_name, date, pay_type, remark = '' } = ctx.request.body;

    // 判空处理，这里前端也可以做，但是后端也需要做一层判断。
    if (!amount || !type_id || !type_name || !date || !pay_type) {
      ctx.body = {
        code: 400,
        msg: '参数错误',
        data: null,
      };
    }

    try {
      const token = ctx.request.header.authorization;
      // 获取用户信息
      const decode = await app.jwt.verify(token, app.config.jwt.secret);
      if (!decode) return;
      // 根据用户的id关联账单
      const result = await ctx.service.bill.add({
        amount,
        type_id,
        type_name,
        date,
        pay_type,
        remark,
        user_id: decode.id,
      });
      ctx.body = {
        code: 200,
        msg: '请求成功',
        data: null,
      };
    } catch (e) {
      ctx.body = {
        code: 500,
        msg: '系统错误',
        data: null,
      };
    }
  }
  async list() {
    const { ctx, app } = this;
    // 获取，日期 date，分页数据，类型 type_id，这些都是我们在前端传给后端的数据
    const { date, page = 1, page_size = 5, type_id = 'all' } = ctx.query;

    try {
      // 通过 token 解析，拿到 user_id
      const token = ctx.request.header.authorization;
      const decode = await app.jwt.verify(token, app.config.jwt.secret);
      if (!decode) return;
      // 拿到当前用户的账单列表
      const list = await ctx.service.bill.list(decode.id);

      // 根据查询条件过滤数据
      // 过滤出月份和类型所对应的账单列表
      const _list = list.filter(item => {
        if (type_id !== 'all') {
          return moment(Number(item.date)).format('YYYY-MM') === date && type_id === item.type_id;
        }
        return moment(Number(item.date)).format('YYYY-MM') === date;
      });
      // 格式化数据，将其变成我们之前设置好的对象格式
      const listMap = _list.reduce((curr, item) => {
        // curr 默认初始值是一个空数组 []
        // 把第一个账单项的时间格式化为 YYYY-MM-DD
        const date = moment(Number(item.date)).format('YYYY-MM-DD');
        // 如果 curr 为空数组，则默认添加第一个账单项 item ，格式化为下列模式
        if (!curr.length) {
          curr.push({
            date,
            bills: [ item ],
          });
        } else {
          const index = curr.findIndex(item => item.date == date);
          // 如果能在累加数组中找到当前日期的，则加入其所在数据
          if (index > -1) {
            curr[index].bills.push(item);
          } else {
            // 累加数组中不存在当前项，则新建数据
            curr.push({
              date,
              bills: [ item ],
            });
          }
        }

        return curr;
      }, []).sort((a, b) => moment(b.date) - moment(a.date)); // 时间顺序为倒叙，时间约新的，在越上面

      // 分页处理，listMap 为我们格式化后的全部数据，还未分页。
      const filterListMap = listMap.slice((page - 1) * page_size, page * page_size);

      // 计算当月总收入和支出
      // 首先获取当月所有账单列表
      const __list = list.filter(item => moment(Number(item.date)).format('YYYY-MM') == date);
      // 累加计算支出
      const totalExpense = __list.reduce((curr, item) => {
        if (item.pay_type === 1) {
          curr += Number(item.amount);
          return curr;
        }
        return curr;
      }, 0);
      // 累加计算收入
      const totalIncome = __list.reduce((curr, item) => {
        if (item.pay_type === 2) {
          curr += Number(item.amount);
          return curr;
        }
        return curr;
      }, 0);

      // 返回数据
      ctx.body = {
        code: 200,
        msg: '请求成功',
        data: {
          totalExpense, // 当月支出
          totalIncome, // 当月收入
          totalPage: Math.ceil(listMap.length / page_size), // 总分页
          list: filterListMap || [], // 格式化后，并且经过分页处理的数据
        },
      };
    } catch (e) {
      ctx.body = {
        code: 500,
        msg: '系统错误',
        data: null,
      };
    }
  }

  // 获取账单详情
  async detail() {
    const { ctx, app } = this;
    // 获取账单 id 参数
    const { id = '' } = ctx.query;
    // 获取用户 user_id
    const token = ctx.request.header.authorization;
    // 获取当前用户信息
    const decode = await app.jwt.verify(token, app.config.jwt.secret);
    if (!decode) return;
    // 判断是否传入账单 id
    if (!id) {
      ctx.body = {
        code: 500,
        msg: '账单id不能为空',
        data: null,
      };
      return;
    }

    try {
    // 从数据库获取账单详情
      const detail = await ctx.service.bill.detail(id, decode.id);
      ctx.body = {
        code: 200,
        msg: '请求成功',
        data: detail,
      };
    } catch (error) {
      ctx.body = {
        code: 500,
        msg: '系统错误',
        data: null,
      };
    }
  }

  // 编辑账单
  async update() {
    const { ctx, app } = this;
    // 账单的相关参数，这里注意要把账单的 id 也传进来
    const { id, amount, type_id, type_name, date, pay_type, remark = '' } = ctx.request.body;
    // 判空处理
    if (!id || !amount || !type_id || !type_name || !date || !pay_type) {
      ctx.body = {
        code: 400,
        msg: '参数错误',
        data: null,
      };
    }

    try {
      const token = ctx.request.header.authorization;
      const decode = await app.jwt.verify(token, app.config.jwt.secret);
      if (!decode) return;
      // 根据账单 id 和 user_id，修改账单数据
      const result = await ctx.service.bill.update({
        id, // 账单 id
        amount, // 金额
        type_id, // 消费类型 id
        type_name, // 消费类型名称
        date, // 日期
        pay_type, // 消费类型
        remark, // 备注
        user_id: decode.id, // 用户 id
      });
      ctx.body = {
        code: 200,
        msg: '请求成功',
        data: null,
      };
    } catch (error) {
      ctx.body = {
        code: 500,
        msg: '系统错误',
        data: null,
      };
    }
  }

  // 删除账单
  async delete() {
    const { ctx, app } = this;
    const { id } = ctx.request.body;

    if (!id) {
      ctx.body = {
        code: 400,
        msg: '参数错误',
        data: null,
      };
    }

    try {
      const token = ctx.request.header.authorization;
      const decode = await app.jwt.verify(token, app.config.jwt.secret);
      if (!decode) return;
      const result = await ctx.service.bill.delete(id, decode.id);
      ctx.body = {
        code: 200,
        msg: '请求成功',
        data: null,
      };
    } catch (error) {
      ctx.body = {
        code: 500,
        msg: '系统错误',
        data: null,
      };
    }
  }

  // 图表分析数据
  async data() {
    const { ctx, app } = this;
    const { date = '' } = ctx.query;
    // 获取用户 user_id
    const token = ctx.request.header.authorization;
    const decode = await app.jwt.verify(token, app.config.jwt.secret);
    if (!decode) return;

    if (!date) {
      ctx.body = {
        code: 400,
        msg: '参数错误',
        data: null,
      };
      return;
    }
    try {
      const result = await ctx.service.bill.list(decode.id);
      const start = moment(date).startOf('month').unix() * 1000; // 选择月份，月初时间
      const end = moment(date).endOf('month').unix() * 1000; // 选择月份，月末时间
      const _data = result.filter(item => {
        if (Number(item.date) > start && Number(item.date) < end) {
          return item;
        }
      });

      // 总支出
      const total_expense = _data.reduce((arr, cur) => {
        if (cur.pay_type == 1) {
          arr += Number(cur.amount);
        }
        return arr;
      }, 0);

      // 总收入
      const total_income = _data.reduce((arr, cur) => {
        if (cur.pay_type == 2) {
          arr += Number(cur.amount);
        }
        return arr;
      }, 0);

      // 获取收支构成
      let total_data = _data.reduce((arr, cur) => {
        const index = arr.findIndex(item => item.type_id == cur.type_id);
        if (index == -1) {
          arr.push({
            type_id: cur.type_id,
            type_name: cur.type_name,
            pay_type: cur.pay_type,
            number: Number(cur.amount),
          });
        }
        if (index > -1) {
          arr[index].number += Number(cur.amount);
        }
        return arr;
      }, []);

      total_data = total_data.map(item => {
        item.number = Number(Number(item.number).toFixed(2));
        return item;
      });

      // 柱状图数据
      // let bar_data = _data.reduce((curr, arr) => {
      //   const index = curr.findIndex(item => item.date == moment(Number(arr.date)).format('YYYY-MM-DD'))
      //   if (index == -1) {
      //     curr.push({
      //       pay_type: arr.pay_type,
      //       date: moment(Number(arr.date)).format('YYYY-MM-DD'),
      //       number: Number(arr.amount)
      //     })
      //   }
      //   if (index > -1) {
      //     curr[index].number += Number(arr.amount)
      //   }

      //   return curr
      // }, [])

      // bar_data = bar_data.sort((a, b) => moment(a.date).unix() - moment(b.date).unix()).map((item) => {
      //   item.number = Number(item.number).toFixed(2)
      //   return item
      // })

      ctx.body = {
        code: 200,
        msg: '请求成功',
        data: {
          total_expense: Number(total_expense).toFixed(2),
          total_income: Number(total_income).toFixed(2),
          total_data: total_data || [],
          // bar_data: bar_data || []
        },
      };
    } catch (error) {
      ctx.body = {
        code: 500,
        msg: '系统错误',
        data: null,
      };
    }
  }
}

module.exports = BillController;
